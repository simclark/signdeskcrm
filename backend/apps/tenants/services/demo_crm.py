"""Demo CRM seed: companies, contacts, follow-ups, plans, listing, draft envelope."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.contacts.models import (
    Company,
    Contact,
    FollowUpPlan,
    FollowUpPlanStep,
    FollowUpTask,
    Listing,
)
from apps.documents.models import Template
from apps.envelopes.models import Envelope, Field, Recipient
from apps.tenants.models import Tenant
from apps.tenants.services.demo_forms import DEMO_SAMPLE_PURCHASE_AGREEMENT

User = get_user_model()

DEMO_COMPANIES = (
    {
        "name": "Maple Street Buyers LLC",
        "website": "https://maplestreetbuyers.example",
        "notes": "Cash buyer — prefers sequential packets.",
    },
    {
        "name": "Oak Ridge Homes",
        "website": "https://oakridgehomes.example",
        "notes": "Listing side for the Evergreen Terrace demo deal.",
    },
)

DEMO_CONTACTS = (
    {
        "first_name": "Ada",
        "last_name": "Buyer",
        "email": "buyer@example.com",
        "phone": "555-0101",
        "title": "Managing Member",
        "company_name": "Maple Street Buyers LLC",
        "stage": Contact.Stage.UNDER_CONTRACT,
        "tags": ["buyer", "demo"],
        "notes": "Primary buyer for the sample purchase agreement pitch.",
    },
    {
        "first_name": "Sam",
        "last_name": "Seller",
        "email": "seller@example.com",
        "phone": "555-0102",
        "title": "Owner",
        "company_name": "Oak Ridge Homes",
        "stage": Contact.Stage.ACTIVE,
        "tags": ["seller", "demo"],
        "notes": "Listing owner — signs second in sequential routing.",
    },
)

DEMO_LISTING = {
    "address": "742 Evergreen Terrace",
    "city": "Springfield",
    "state": "IL",
    "postal_code": "62704",
    "mls_number": "MLS-DEMO-1001",
    "price": "425000",
    "beds": Decimal("3.0"),
    "baths": Decimal("2.0"),
    "sqft": 1850,
    "year_built": 1998,
    "description": "Demo listing for the Sample Purchase Agreement pitch.",
    "source": "manual",
}

DEMO_STALLED_PLAN = {
    "name": "Stalled signer nudge",
    "description": "Short email sequence when a signer goes idle after send.",
    "trigger": FollowUpPlan.Trigger.STALLED,
    "idle_hours": 48,
    "create_agent_handoff": True,
    "handoff_title": "Call signer — stalled packet",
    "steps": (
        {
            "order": 1,
            "offset_days": 0,
            "subject": "Reminder: please sign {{envelope_title}}",
            "body": (
                "Hi {{recipient_name}},\n\n"
                "Your signature is still needed on {{envelope_title}}.\n\n"
                "Sign here: {{sign_link}}\n\n"
                "Thanks,\nDemo Realty"
            ),
        },
        {
            "order": 2,
            "offset_days": 2,
            "subject": "Second reminder: {{envelope_title}}",
            "body": (
                "Hi {{recipient_name}},\n\n"
                "Quick follow-up — {{envelope_title}} is still waiting on you.\n\n"
                "{{sign_link}}\n\n"
                "Demo Realty"
            ),
        },
    ),
}

DEMO_COMPLETED_PLAN = {
    "name": "Post-close thank you",
    "description": "One email after the envelope completes.",
    "trigger": FollowUpPlan.Trigger.COMPLETED,
    "idle_hours": 48,
    "create_agent_handoff": False,
    "handoff_title": "",
    "steps": (
        {
            "order": 1,
            "offset_days": 0,
            "subject": "Signed: {{envelope_title}}",
            "body": (
                "Hi {{recipient_name}},\n\n"
                "Thanks for completing {{envelope_title}}. "
                "Your signed copy is attached to the completion email.\n\n"
                "Demo Realty"
            ),
        },
    ),
}


def seed_demo_crm(tenant: Tenant, *, owner: User, template: Template) -> Envelope:
    """Seed companies, contacts, plans, tasks, listing, and a ready draft envelope."""
    companies = {
        row["name"]: Company.objects.create(
            tenant=tenant,
            name=row["name"],
            website=row["website"],
            notes=row["notes"],
        )
        for row in DEMO_COMPANIES
    }

    contacts: dict[str, Contact] = {}
    for row in DEMO_CONTACTS:
        contact = Contact.objects.create(
            tenant=tenant,
            company=companies.get(row["company_name"]),
            first_name=row["first_name"],
            last_name=row["last_name"],
            email=row["email"],
            phone=row["phone"],
            title=row["title"],
            stage=row["stage"],
            tags=list(row["tags"]),
            notes=row["notes"],
            is_archived=False,
        )
        contacts[row["email"]] = contact

    buyer = contacts["buyer@example.com"]
    seller = contacts["seller@example.com"]

    now = timezone.now()
    open_task = FollowUpTask.objects.create(
        tenant=tenant,
        contact=buyer,
        title="Confirm inspection timeline",
        due_at=now + timedelta(days=1),
        status=FollowUpTask.Status.OPEN,
        notes="Ada asked about the inspection window before signing.",
        created_by=owner,
    )
    FollowUpTask.objects.create(
        tenant=tenant,
        contact=seller,
        title="Send disclosure packet",
        due_at=now - timedelta(days=2),
        status=FollowUpTask.Status.DONE,
        notes="Disclosures emailed; marked done for demo history.",
        created_by=owner,
        completed_at=now - timedelta(days=1),
    )
    buyer.next_follow_up_at = open_task.due_at
    buyer.save(update_fields=["next_follow_up_at", "updated_at"])

    stalled_plan = _create_plan(tenant, DEMO_STALLED_PLAN)
    _create_plan(tenant, DEMO_COMPLETED_PLAN)

    listing = Listing.objects.create(tenant=tenant, **DEMO_LISTING)

    return _seed_draft_envelope(
        tenant,
        owner=owner,
        template=template,
        buyer=buyer,
        seller=seller,
        listing=listing,
        follow_up_plan=stalled_plan,
    )


def _create_plan(tenant: Tenant, definition: dict) -> FollowUpPlan:
    plan = FollowUpPlan.objects.create(
        tenant=tenant,
        name=definition["name"],
        description=definition["description"],
        trigger=definition["trigger"],
        idle_hours=definition["idle_hours"],
        create_agent_handoff=definition["create_agent_handoff"],
        handoff_title=definition["handoff_title"],
        is_active=True,
        is_archived=False,
    )
    for step in definition["steps"]:
        FollowUpPlanStep.objects.create(
            tenant=tenant,
            plan=plan,
            order=step["order"],
            offset_days=step["offset_days"],
            subject=step["subject"],
            body=step["body"],
        )
    return plan


def _seed_draft_envelope(
    tenant: Tenant,
    *,
    owner: User,
    template: Template,
    buyer: Contact,
    seller: Contact,
    listing: Listing,
    follow_up_plan: FollowUpPlan,
) -> Envelope:
    document = template.document
    version = document.current_version
    merge_data = {
        "price": listing.price,
        "listing": {
            "full_address": listing.full_address,
            "mls_number": listing.mls_number or "",
        },
    }
    envelope = Envelope.objects.create(
        tenant=tenant,
        title="Demo Purchase Agreement",
        message="Please review and sign the Sample Purchase Agreement.",
        status=Envelope.Status.DRAFT,
        routing=Envelope.Routing.SEQUENTIAL,
        document=document,
        document_version=version,
        template=template,
        listing=listing,
        follow_up_plan=follow_up_plan,
        merge_data=merge_data,
        created_by=owner,
    )

    buyer_recipient = Recipient.objects.create(
        tenant=tenant,
        envelope=envelope,
        contact=buyer,
        name=buyer.full_name,
        email=buyer.email,
        role=Recipient.Role.SIGNER,
        role_key="buyer",
        routing_order=1,
        status=Recipient.Status.PENDING,
    )
    seller_recipient = Recipient.objects.create(
        tenant=tenant,
        envelope=envelope,
        contact=seller,
        name=seller.full_name,
        email=seller.email,
        role=Recipient.Role.SIGNER,
        role_key="seller",
        routing_order=2,
        status=Recipient.Status.PENDING,
    )
    recipients_by_key = {
        "buyer": buyer_recipient,
        "seller": seller_recipient,
    }
    recipients_by_index = [buyer_recipient, seller_recipient]

    merge_values = {
        "listing.full_address": listing.full_address,
        "deal.price": listing.price,
        "listing.mls_number": listing.mls_number or "",
        "role.buyer.name": buyer.full_name,
        "role.seller.name": seller.full_name,
    }

    for item in DEMO_SAMPLE_PURCHASE_AGREEMENT["field_layout"]:
        fill_mode = item.get("fill_mode") or Field.FillMode.SIGNER
        merge_token = item.get("merge_token") or ""
        recipient = None
        if fill_mode != Field.FillMode.DOCUMENT:
            role_key = item.get("role_key") or ""
            if role_key and role_key in recipients_by_key:
                recipient = recipients_by_key[role_key]
            else:
                idx = item.get("recipient_index")
                if idx is None:
                    idx = 0
                recipient = recipients_by_index[min(max(int(idx), 0), len(recipients_by_index) - 1)]
        Field.objects.create(
            tenant=tenant,
            envelope=envelope,
            recipient=recipient,
            field_type=item["field_type"],
            page=item.get("page") or 1,
            x=item["x"],
            y=item["y"],
            w=item["w"],
            h=item["h"],
            required=item.get("required", True),
            label=item.get("label") or "",
            merge_token=merge_token,
            fill_mode=fill_mode,
            value=merge_values.get(merge_token, ""),
        )

    return envelope
