from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.documents.form_library.definitions import LIBRARY_FORMS
from apps.documents.form_library.pdfs import write_sample_purchase_agreement_pdf
from apps.documents.models import Document, DocumentVersion, Template
from apps.tenants.models import Tenant
import tempfile
import os


class Command(BaseCommand):
    help = (
        "Seed the horizontal form library (sample purchase agreement with roles "
        "+ merge tokens) into a tenant. Design partners should also upload official "
        "board PDFs (e.g. TREC) separately."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant-slug",
            required=True,
            help="Workspace slug to seed (e.g. shapiro-group)",
        )
        parser.add_argument(
            "--replace",
            action="store_true",
            help="Re-seed and overwrite existing library_key templates",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        slug = options["tenant_slug"]
        try:
            tenant = Tenant.objects.get(slug=slug)
        except Tenant.DoesNotExist as exc:
            raise CommandError(f"Tenant not found: {slug}") from exc

        created = 0
        updated = 0
        for form_def in LIBRARY_FORMS:
            key = form_def["library_key"]
            existing = Template.objects.for_tenant(tenant).filter(library_key=key).first()
            if existing and not options["replace"]:
                self.stdout.write(f"Skip existing library form: {key}")
                continue

            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp_path = tmp.name
            try:
                write_sample_purchase_agreement_pdf(tmp_path)
                if existing and options["replace"]:
                    document = existing.document
                    # replace file on new version if needed — simplest: update layout on template
                    existing.name = form_def["name"]
                    existing.category = form_def["category"]
                    existing.description = form_def["description"]
                    existing.roles = form_def["roles"]
                    existing.field_layout = form_def["field_layout"]
                    existing.is_library = True
                    existing.is_active = True
                    existing.is_archived = False
                    existing.save()
                    updated += 1
                    self.stdout.write(self.style.SUCCESS(f"Updated {key}"))
                else:
                    document = Document.objects.create(
                        tenant=tenant,
                        title=form_def["name"],
                        original_filename=f"{key}.pdf",
                        created_by=None,
                    )
                    with open(tmp_path, "rb") as fh:
                        version = DocumentVersion(
                            tenant=tenant,
                            document=document,
                            version_number=1,
                        )
                        version.file.save(f"{key}.pdf", File(fh), save=False)
                        version.page_count = 1
                        version.save()
                        version.compute_hash()
                        version.save(update_fields=["sha256", "byte_size"])
                    Template.objects.create(
                        tenant=tenant,
                        name=form_def["name"],
                        document=document,
                        field_layout=form_def["field_layout"],
                        roles=form_def["roles"],
                        category=form_def["category"],
                        description=form_def["description"],
                        is_library=True,
                        library_key=key,
                        is_active=True,
                        created_by=None,
                    )
                    created += 1
                    self.stdout.write(self.style.SUCCESS(f"Created {key}"))
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

        self.stdout.write(
            self.style.SUCCESS(
                f"Form library seed complete for {slug}: created={created} updated={updated}"
            )
        )
