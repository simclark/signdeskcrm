"""Inventory helpers for stored media vs FileField references."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from django.core.files.storage import default_storage

# Primary tree is tenants/<id>/… Legacy flat trees are still scanned so orphan
# cleanup and migration remain safe until old objects are rewritten.
MEDIA_PREFIXES = (
    "tenants/",
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
        """DB FileField names whose files are absent in storage."""
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


def _listdir_recursive(prefix: str) -> set[str]:
    """Recursively list files under a storage prefix."""
    found: set[str] = set()
    # Normalize to no leading slash; ensure trailing slash for "directory" walk
    base = prefix.strip("/")
    if base and not base.endswith("/"):
        base = f"{base}/"
    stack = [base]
    while stack:
        current = stack.pop()
        try:
            dirs, files = default_storage.listdir(current)
        except Exception:
            continue
        for name in files:
            if name in IGNORE_NAMES:
                continue
            rel = f"{current}{name}" if current else name
            found.add(rel)
        for name in dirs:
            child = f"{current}{name}/" if current else f"{name}/"
            stack.append(child)
    return found


def collect_on_disk_media(*, prefixes: tuple[str, ...] | None = None) -> set[str]:
    """Return relative paths in storage for known upload trees."""
    use_prefixes = prefixes or MEDIA_PREFIXES
    found: set[str] = set()
    for prefix in use_prefixes:
        found |= _listdir_recursive(prefix)
    return found


def build_media_inventory(*, prefixes: tuple[str, ...] | None = None) -> MediaInventory:
    return MediaInventory(
        referenced=collect_referenced_media(),
        on_disk=collect_on_disk_media(prefixes=prefixes),
    )


def delete_orphan_files(orphans: set[str]) -> tuple[int, list[str]]:
    """Delete orphan relative paths from default storage. Returns (deleted, errors)."""
    deleted = 0
    errors: list[str] = []
    for rel in sorted(orphans):
        if ".." in Path(rel).parts or rel.startswith("/"):
            errors.append(f"skipped unsafe path: {rel}")
            continue
        try:
            if not default_storage.exists(rel):
                continue
            default_storage.delete(rel)
            deleted += 1
        except OSError as exc:
            errors.append(f"{rel}: {exc}")
        except Exception as exc:  # noqa: BLE001 — report and continue
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
