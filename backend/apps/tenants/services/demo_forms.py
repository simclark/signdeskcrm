"""Demo-only Sample Purchase Agreement seed (not the retired platform catalog)."""

from __future__ import annotations

import os
import tempfile

from django.core.files import File

from apps.documents.form_library.pdfs import write_sample_purchase_agreement_pdf
from apps.documents.models import Document, DocumentVersion, Template
from apps.tenants.models import Tenant

DEMO_SAMPLE_LIBRARY_KEY = "sample-purchase-agreement"

DEMO_SAMPLE_PURCHASE_AGREEMENT = {
    "library_key": DEMO_SAMPLE_LIBRARY_KEY,
    "name": "Sample Purchase Agreement",
    "category": "general",
    "description": (
        "Demo multi-party agreement with Buyer / Seller roles. "
        "Use for the live pitch: sequential Buyer → Seller signing."
    ),
    "roles": [
        {"key": "buyer", "label": "Buyer", "order": 1},
        {"key": "seller", "label": "Seller", "order": 2},
    ],
    "field_layout": [
        {
            "field_type": "text",
            "page": 1,
            "x": 0.12,
            "y": 0.78,
            "w": 0.55,
            "h": 0.035,
            "required": True,
            "label": "Property address",
            "recipient_index": None,
            "role_key": "",
            "merge_token": "listing.full_address",
            "fill_mode": "document",
            "prefill_editable": True,
        },
        {
            "field_type": "text",
            "page": 1,
            "x": 0.12,
            "y": 0.72,
            "w": 0.28,
            "h": 0.035,
            "required": True,
            "label": "Purchase price",
            "recipient_index": None,
            "role_key": "",
            "merge_token": "deal.price",
            "fill_mode": "document",
            "prefill_editable": True,
        },
        {
            "field_type": "text",
            "page": 1,
            "x": 0.45,
            "y": 0.72,
            "w": 0.28,
            "h": 0.035,
            "required": False,
            "label": "MLS number",
            "recipient_index": None,
            "role_key": "",
            "merge_token": "listing.mls_number",
            "fill_mode": "document",
            "prefill_editable": True,
        },
        {
            "field_type": "text",
            "page": 1,
            "x": 0.12,
            "y": 0.55,
            "w": 0.35,
            "h": 0.035,
            "required": True,
            "label": "Buyer legal name",
            "recipient_index": None,
            "role_key": "",
            "merge_token": "role.buyer.name",
            "fill_mode": "document",
            "prefill_editable": True,
        },
        {
            "field_type": "signature",
            "page": 1,
            "x": 0.12,
            "y": 0.42,
            "w": 0.35,
            "h": 0.06,
            "required": True,
            "label": "Buyer signature",
            "recipient_index": 0,
            "role_key": "buyer",
            "merge_token": "",
            "fill_mode": "signer",
            "prefill_editable": False,
        },
        {
            "field_type": "date",
            "page": 1,
            "x": 0.50,
            "y": 0.42,
            "w": 0.22,
            "h": 0.04,
            "required": True,
            "label": "Buyer date",
            "recipient_index": 0,
            "role_key": "buyer",
            "merge_token": "",
            "fill_mode": "signer",
            "prefill_editable": False,
        },
        {
            "field_type": "text",
            "page": 1,
            "x": 0.12,
            "y": 0.30,
            "w": 0.35,
            "h": 0.035,
            "required": True,
            "label": "Seller legal name",
            "recipient_index": None,
            "role_key": "",
            "merge_token": "role.seller.name",
            "fill_mode": "document",
            "prefill_editable": True,
        },
        {
            "field_type": "signature",
            "page": 1,
            "x": 0.12,
            "y": 0.17,
            "w": 0.35,
            "h": 0.06,
            "required": True,
            "label": "Seller signature",
            "recipient_index": 1,
            "role_key": "seller",
            "merge_token": "",
            "fill_mode": "signer",
            "prefill_editable": False,
        },
        {
            "field_type": "date",
            "page": 1,
            "x": 0.50,
            "y": 0.17,
            "w": 0.22,
            "h": 0.04,
            "required": True,
            "label": "Seller date",
            "recipient_index": 1,
            "role_key": "seller",
            "merge_token": "",
            "fill_mode": "signer",
            "prefill_editable": False,
        },
    ],
}


def seed_demo_sample_purchase_agreement(tenant: Tenant) -> Template:
    """Create the Sample Purchase Agreement document + shared-library template."""
    form_def = DEMO_SAMPLE_PURCHASE_AGREEMENT
    key = form_def["library_key"]

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        write_sample_purchase_agreement_pdf(tmp_path)
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
        return Template.objects.create(
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
            is_archived=False,
            created_by=None,
        )
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
