from django.core.management.base import BaseCommand, CommandError

from apps.documents.form_library.ensure import ensure_form_library
from apps.tenants.models import Tenant


class Command(BaseCommand):
    help = (
        "Ops/internal: sync SignDesk platform form-library catalog into tenant(s). "
        "Workspaces also receive missing catalog forms on signup and when listing "
        "the Form library. Design partners upload official board PDFs separately."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant-slug",
            help="Workspace slug to seed (e.g. shapiro-group). Omit with --all-tenants.",
        )
        parser.add_argument(
            "--all-tenants",
            action="store_true",
            help="Backfill missing catalog forms for every workspace",
        )
        parser.add_argument(
            "--replace",
            action="store_true",
            help="Re-seed and overwrite existing library_key templates",
        )

    def handle(self, *args, **options):
        replace = options["replace"]
        if options["all_tenants"]:
            tenants = Tenant.objects.order_by("slug")
            if not tenants.exists():
                raise CommandError("No tenants found")
        elif options["tenant_slug"]:
            try:
                tenants = [Tenant.objects.get(slug=options["tenant_slug"])]
            except Tenant.DoesNotExist as exc:
                raise CommandError(f"Tenant not found: {options['tenant_slug']}") from exc
        else:
            raise CommandError("Provide --tenant-slug or --all-tenants")

        for tenant in tenants:
            stats = ensure_form_library(tenant, replace=replace)
            self.stdout.write(
                self.style.SUCCESS(
                    f"{tenant.slug}: created={stats['created']} "
                    f"updated={stats['updated']} skipped={stats['skipped']}"
                )
            )
