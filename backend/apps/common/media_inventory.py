"""Inventory helpers for MEDIA_ROOT vs FileField references."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from django.conf import settings

# Only walk these trees — ignore anything else under MEDIA_ROOT.
MEDIA_PREFIXES = (
    "documents/",
    "signed/",
    "certificates/",
    "signatures/",
    "tenant_logos/",
    "tenant_icons/",
)

IGNORE_NAMES = {".DS_Store", "Thumbs.db", ".gitkeep"}


@dataclass(frozen=True)
class MediaInventory:
    referenced: set[str]
    on_disk: set[str]

    @property
    def orphans(self) -> set[str]:
        return self.on_disk - self.referenced

    @property
    def missing(self) -> set[str]:
        """DB FileField names whose files are absent on disk."""
        return self.referenced - self.on_disk


def collect_referenced_media() -> set[str]:
    """Return relative paths currently pointed to by FileFields."""
    from apps.documents.models import DocumentVersion
    from apps.envelopes.models import Envelope, SignatureAsset
    from apps.tenants.models import Tenant

    names: set[str] = set()

    def add(field) -> None:
        if field and getattr(field, "name", None):
            names.add(field.name)

    for version in DocumentVersion.objects.exclude(file="").iterator():
        add(version.file)
    for envelope in Envelope.objects.all().iterator():
        add(envelope.signed_file)
        add(envelope.certificate_file)
    for asset in SignatureAsset.objects.exclude(image="").iterator():
        add(asset.image)
    for tenant in Tenant.objects.all().iterator():
        add(tenant.logo)
        add(tenant.icon)
    return names


def collect_on_disk_media(*, prefixes: tuple[str, ...] | None = None) -> set[str]:
    """Return relative paths under MEDIA_ROOT for known upload trees."""
    root = Path(settings.MEDIA_ROOT)
    if not root.exists():
        return set()
    use_prefixes = prefixes or MEDIA_PREFIXES
    found: set[str] = set()
    for prefix in use_prefixes:
        base = root / prefix.rstrip("/")
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            if path.name in IGNORE_NAMES:
                continue
            rel = path.relative_to(root).as_posix()
            found.add(rel)
    return found


def build_media_inventory(*, prefixes: tuple[str, ...] | None = None) -> MediaInventory:
    return MediaInventory(
        referenced=collect_referenced_media(),
        on_disk=collect_on_disk_media(prefixes=prefixes),
    )


def delete_orphan_files(orphans: set[str]) -> tuple[int, list[str]]:
    """Unlink orphan relative paths under MEDIA_ROOT. Returns (deleted, errors)."""
    root = Path(settings.MEDIA_ROOT).resolve()
    deleted = 0
    errors: list[str] = []
    for rel in sorted(orphans):
        # Refuse path traversal
        if ".." in Path(rel).parts or rel.startswith("/"):
            errors.append(f"skipped unsafe path: {rel}")
            continue
        full = (root / rel).resolve()
        if not str(full).startswith(str(root) + os.sep) and full != root:
            errors.append(f"skipped outside MEDIA_ROOT: {rel}")
            continue
        if not full.is_file():
            continue
        try:
            full.unlink()
            deleted += 1
            # Clean empty parent dirs under MEDIA_ROOT (best-effort)
            parent = full.parent
            while parent != root and parent.is_dir() and not any(parent.iterdir()):
                parent.rmdir()
                parent = parent.parent
        except OSError as exc:
            errors.append(f"{rel}: {exc}")
    return deleted, errors


def safe_delete_field_file(field_file) -> None:
    """Delete a FieldFile from storage if present; never raise."""
    if not field_file or not getattr(field_file, "name", None):
        return
    try:
        field_file.delete(save=False)
    except Exception:  # noqa: BLE001 — cleanup must not break model delete
        pass
