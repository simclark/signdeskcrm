"""Rewrite legacy media object keys into tenants/<id>/… prefixes.

Defaults to the reserved ``demo`` tenant only. Dry-run by default. Copies in
storage, updates FileField names, then deletes the old key. Safe to re-run
(already-prefixed paths are skipped).

Examples:

  python manage.py migrate_media_to_tenant_paths
  python manage.py migrate_media_to_tenant_paths --apply
  python manage.py migrate_media_to_tenant_paths --tenant-slug acme --apply
  python manage.py migrate_media_to_tenant_paths --all-tenants --apply
"""

from __future__ import annotations

from pathlib import PurePosixPath

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import get_valid_filename

from apps.common.upload_paths import is_tenant_prefixed
from apps.documents.models import DocumentVersion
from apps.envelopes.models import Envelope, SignatureAsset
from apps.tenants.models import Tenant
from apps.tenants.services.demo import DEMO_SLUG


def _legacy_dated_target(tenant_id: int, category: str, old_name: str) -> str:
    """
    Map documents|signed|certificates|signatures/<yyyy>/<mm>/<file>
    → tenants/<id>/<category>/<yyyy>/<mm>/<file>
    """
    parts = PurePosixPath(old_name).parts
    filename = get_valid_filename(parts[-1] if parts else "file.bin")
    # Prefer preserving yyyy/mm when present: category/yyyy/mm/file
    if len(parts) >= 4 and parts[0] == category:
        yyyy, mm = parts[1], parts[2]
        if yyyy.isdigit() and len(yyyy) == 4 and mm.isdigit():
            return f"tenants/{tenant_id}/{category}/{yyyy}/{mm}/{filename}"
    return f"tenants/{tenant_id}/{category}/{filename}"


def _legacy_branding_target(tenant_id: int, kind: str, old_name: str) -> str:
    filename = get_valid_filename(PurePosixPath(old_name).name)
    return f"tenants/{tenant_id}/branding/{kind}/{filename}"


def _copy_storage(old_name: str, new_name: str) -> None:
    if old_name == new_name:
        return
    if default_storage.exists(new_name):
        return
    # Use _save so AWS_S3_FILE_OVERWRITE=False cannot rename the target key.
    with default_storage.open(old_name, "rb") as fh:
        default_storage._save(new_name, ContentFile(fh.read()))


class Command(BaseCommand):
    help = (
        "Move media objects from flat date trees into tenants/<id>/… keys "
        f"(default scope: slug '{DEMO_SLUG}')."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Perform copies + DB updates + delete old keys (default is dry-run).",
        )
        parser.add_argument(
            "--tenant-slug",
            default=DEMO_SLUG,
            help=f"Only migrate this tenant (default: {DEMO_SLUG}).",
        )
        parser.add_argument(
            "--all-tenants",
            action="store_true",
            help="Migrate every tenant (ignores --tenant-slug).",
        )

    def handle(self, *args, **options):
        apply = options["apply"]
        if options["all_tenants"]:
            tenants = list(Tenant.objects.all())
            scope = "all tenants"
        else:
            slug = (options["tenant_slug"] or "").strip()
            tenant = Tenant.objects.filter(slug=slug).first()
            if tenant is None:
                raise CommandError(f"Tenant slug '{slug}' not found.")
            tenants = [tenant]
            scope = f"tenant '{tenant.slug}' (id={tenant.pk})"

        tenant_ids = {t.pk for t in tenants}
        self.stdout.write(f"Scope: {scope}")

        planned: list[tuple[str, object, str, str, str]] = []
        # (label, instance, field_name, old, new)

        for version in (
            DocumentVersion.objects.filter(tenant_id__in=tenant_ids)
            .exclude(file="")
            .iterator()
        ):
            old = version.file.name
            if is_tenant_prefixed(old):
                continue
            new = _legacy_dated_target(version.tenant_id, "documents", old)
            planned.append(("DocumentVersion.file", version, "file", old, new))

        for envelope in Envelope.objects.filter(tenant_id__in=tenant_ids).iterator():
            for field_name, category in (
                ("signed_file", "signed"),
                ("certificate_file", "certificates"),
            ):
                field = getattr(envelope, field_name)
                old = getattr(field, "name", None) or ""
                if not old or is_tenant_prefixed(old):
                    continue
                new = _legacy_dated_target(envelope.tenant_id, category, old)
                planned.append((f"Envelope.{field_name}", envelope, field_name, old, new))

        for asset in (
            SignatureAsset.objects.filter(tenant_id__in=tenant_ids)
            .exclude(image="")
            .iterator()
        ):
            old = asset.image.name
            if is_tenant_prefixed(old):
                continue
            new = _legacy_dated_target(asset.tenant_id, "signatures", old)
            planned.append(("SignatureAsset.image", asset, "image", old, new))

        for tenant in tenants:
            for field_name, kind in (("logo", "logo"), ("icon", "icon")):
                field = getattr(tenant, field_name)
                old = getattr(field, "name", None) or ""
                if not old or is_tenant_prefixed(old):
                    continue
                new = _legacy_branding_target(tenant.pk, kind, old)
                planned.append((f"Tenant.{field_name}", tenant, field_name, old, new))

        if not planned:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Nothing to migrate for {scope} — keys already tenant-prefixed "
                    "or no files."
                )
            )
            return

        self.stdout.write(f"Planned moves: {len(planned)}")
        for label, _obj, _field, old, new in planned[:50]:
            self.stdout.write(f"  {label}: {old} → {new}")
        if len(planned) > 50:
            self.stdout.write(f"  … {len(planned) - 50} more")

        if not apply:
            self.stdout.write(
                self.style.NOTICE("Dry run only. Re-run with --apply to rewrite keys.")
            )
            return

        moved = 0
        errors: list[str] = []
        for label, obj, field_name, old, new in planned:
            try:
                with transaction.atomic():
                    if not default_storage.exists(old):
                        errors.append(f"{label}: missing source {old}")
                        continue
                    _copy_storage(old, new)
                    setattr(obj, field_name, new)
                    obj.save(update_fields=[field_name])
                    if old != new and default_storage.exists(old):
                        default_storage.delete(old)
                    moved += 1
            except Exception as exc:  # noqa: BLE001 — report and continue
                errors.append(f"{label} {old}: {exc}")

        self.stdout.write(self.style.SUCCESS(f"Migrated {moved} object(s)."))
        for err in errors:
            self.stdout.write(self.style.ERROR(err))
