"""Audit (and optionally delete) orphaned files in media storage.

Orphans are stored objects that no FileField currently references. Django does
not delete FieldFiles on CASCADE, so tenant/document/envelope deletes leave
files behind unless cleaned up.

Examples:

  # Report only (safe default)
  python manage.py audit_media_orphans

  # Scope to signed PDFs only
  python manage.py audit_media_orphans --prefix signed

  # Delete orphans after listing them
  python manage.py audit_media_orphans --delete
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.common.media_inventory import (
    MEDIA_PREFIXES,
    build_media_inventory,
    delete_orphan_files,
)


class Command(BaseCommand):
    help = "List (and optionally delete) media files not referenced by the DB."

    def add_arguments(self, parser):
        parser.add_argument(
            "--delete",
            action="store_true",
            help="Permanently delete orphaned files (default is dry-run report only).",
        )
        parser.add_argument(
            "--prefix",
            action="append",
            dest="prefixes",
            choices=[p.rstrip("/") for p in MEDIA_PREFIXES],
            help=(
                "Limit scan to one upload tree (repeatable). "
                "Choices: tenants, documents, signed, certificates, signatures, "
                "tenant_logos, tenant_icons."
            ),
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=50,
            help="Max orphan paths to print (default 50). Use 0 for all.",
        )

    def handle(self, *args, **options):
        prefixes = options["prefixes"]
        if prefixes:
            prefix_tuple = tuple(f"{p}/" for p in prefixes)
        else:
            prefix_tuple = None

        inventory = build_media_inventory(prefixes=prefix_tuple)
        orphans = sorted(inventory.orphans)
        missing = sorted(inventory.missing)

        self.stdout.write(
            f"Referenced by DB: {len(inventory.referenced)}\n"
            f"In storage (scanned): {len(inventory.on_disk)}\n"
            f"Orphans (storage only): {len(orphans)}\n"
            f"Missing (DB only): {len(missing)}"
        )

        limit = options["limit"]
        show = orphans if limit == 0 else orphans[:limit]
        for rel in show:
            self.stdout.write(f"  orphan: {rel}")
        if limit and len(orphans) > limit:
            self.stdout.write(f"  … {len(orphans) - limit} more")

        if missing:
            self.stdout.write(self.style.WARNING("DB references with no file in storage:"))
            for rel in missing[: limit or None]:
                self.stdout.write(f"  missing: {rel}")

        if not options["delete"]:
            self.stdout.write(
                self.style.NOTICE(
                    "Dry run only. Re-run with --delete to remove orphans."
                )
            )
            return

        if not orphans:
            self.stdout.write(self.style.SUCCESS("Nothing to delete."))
            return

        deleted, errors = delete_orphan_files(set(orphans))
        self.stdout.write(self.style.SUCCESS(f"Deleted {deleted} orphaned file(s)."))
        for err in errors:
            self.stdout.write(self.style.ERROR(err))
        if errors:
            raise CommandError(f"{len(errors)} error(s) during delete.")
