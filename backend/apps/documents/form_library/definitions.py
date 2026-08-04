"""SignDesk platform form-library catalog (horizontal; not TREC-licensed content).

Entries are copied into each workspace via ensure_form_library (signup + Form
library list). Tenants upload official board PDFs themselves and may promote
those templates into their Form library; they never edit catalog source here.
"""

from __future__ import annotations

SAMPLE_PURCHASE_AGREEMENT = {
    "library_key": "sample-purchase-agreement",
    "name": "Sample Purchase Agreement",
    "category": "general",
    "description": (
        "Demo multi-party agreement with Buyer / Seller / Agent roles and "
        "shared document-data merge tokens. Replace with your board forms "
        "(e.g. TREC) by uploading the official PDF and cloning this field pattern."
    ),
    "roles": [
        {"key": "buyer", "label": "Buyer", "order": 1},
        {"key": "seller", "label": "Seller", "order": 2},
        {"key": "agent", "label": "Agent", "order": 3},
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


def _optional_service_initials_layout() -> list[dict]:
    """20 optional initials (service choices) + required signature for send/finish."""
    fields: list[dict] = []
    for i in range(20):
        row = i % 10
        col = i // 10
        fields.append(
            {
                "field_type": "initials",
                "page": 1,
                "x": 0.42 + col * 0.45,
                "y": 0.82 - row * 0.065,
                "w": 0.10,
                "h": 0.04,
                "required": False,
                "label": f"Service {i + 1} initials",
                "recipient_index": 0,
                "role_key": "client",
                "merge_token": "",
                "fill_mode": "signer",
                "prefill_editable": False,
            }
        )
    fields.append(
        {
            "field_type": "signature",
            "page": 1,
            "x": 0.12,
            "y": 0.08,
            "w": 0.35,
            "h": 0.06,
            "required": True,
            "label": "Client signature",
            "recipient_index": 0,
            "role_key": "client",
            "merge_token": "",
            "fill_mode": "signer",
            "prefill_editable": False,
        }
    )
    return fields


OPTIONAL_SERVICE_INITIALS = {
    "library_key": "optional-service-initials",
    "name": "Optional Service Initials (Bug Repro)",
    "category": "general",
    "description": (
        "QA form: 20 optional initials boxes (services you may elect) plus one "
        "required signature. Use to reproduce initials rendering as full name."
    ),
    "roles": [
        {"key": "client", "label": "Client", "order": 1},
    ],
    "field_layout": _optional_service_initials_layout(),
}

LIBRARY_FORMS = [SAMPLE_PURCHASE_AGREEMENT, OPTIONAL_SERVICE_INITIALS]
