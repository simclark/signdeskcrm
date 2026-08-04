"""Copy SignDesk platform form-library catalog entries into a tenant."""

from __future__ import annotations

import os
import tempfile

from django.core.files import File
from django.db import transaction

from apps.documents.form_library.definitions import LIBRARY_FORMS
from apps.documents.form_library.pdfs import (
    write_optional_service_initials_pdf,
    write_sample_purchase_agreement_pdf,
)
from apps.documents.models import Document, DocumentVersion, Template
from apps.tenants.models import Tenant

# Map library_key → PDF writer. Extend when adding catalog forms.
_PDF_WRITERS = {
    "sample-purchase-agreement": write_sample_purchase_agreement_pdf,
    "optional-service-initials": write_optional_service_initials_pdf,
}


def _write_catalog_pdf(library_key: str, path: str) -> None:
    writer = _PDF_WRITERS.get(library_key) or write_sample_purchase_agreement_pdf
    writer(path)


@transaction.atomic
def ensure_form_library(tenant: Tenant, *, replace: bool = False) -> dict[str, int]:
    """Create missing platform library templates for a tenant.

    When ``replace`` is True, refresh existing keyed rows from the catalog.
    Tenant-promoted library forms (``library_key`` null) are never touched.
    """
    created = 0
    updated = 0
    skipped = 0

    for form_def in LIBRARY_FORMS:
        key = form_def["library_key"]
        existing = Template.objects.for_tenant(tenant).filter(library_key=key).first()
        if existing and not replace:
            skipped += 1
            continue

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            _write_catalog_pdf(key, tmp_path)
            if existing and replace:
                existing.name = form_def["name"]
                existing.category = form_def["category"]
                existing.description = form_def["description"]
                existing.roles = form_def["roles"]
                existing.field_layout = form_def["field_layout"]
                existing.is_library = True
                existing.is_active = True
                existing.is_archived = False
                existing.save()
                # Refresh the PDF on disk so --replace repairs missing/corrupt files.
                document = existing.document
                next_version = (document.versions.count() or 0) + 1
                with open(tmp_path, "rb") as fh:
                    version = DocumentVersion(
                        tenant=tenant,
                        document=document,
                        version_number=next_version,
                    )
                    version.file.save(f"{key}.pdf", File(fh), save=False)
                    version.page_count = 1
                    version.save()
                    version.compute_hash()
                    version.save(update_fields=["sha256", "byte_size"])
                updated += 1
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
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    return {"created": created, "updated": updated, "skipped": skipped}
