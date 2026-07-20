"""Wipe and reseed the reserved demo tenant (CLI + platform API)."""

from __future__ import annotations

from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.db import transaction

from apps.tenants.models import Invitation, Membership, Tenant, ensure_email_templates

User = get_user_model()

DEMO_SLUG = "demo"
DEMO_NAME = "Demo Realty"
DEMO_OWNER_EMAIL_DEFAULT = "owner@demo.signdeskcrm.test"
DEMO_CONTACTS = (
    {"first_name": "Ada", "last_name": "Buyer", "email": "buyer@example.com"},
    {"first_name": "Sam", "last_name": "Seller", "email": "seller@example.com"},
)


@dataclass
class ResetDemoResult:
    tenant: Tenant
    owner_email: str
    password_set: bool


def _delete_file_field(field) -> None:
    if not field:
        return
    try:
        field.delete(save=False)
    except Exception:  # noqa: BLE001 — best-effort media cleanup
        pass


@transaction.atomic
def reset_demo_tenant(
    *,
    owner_email: str | None = None,
    owner_password: str | None = None,
    owner_first_name: str = "Demo",
    owner_last_name: str = "Owner",
) -> ResetDemoResult:
    """Reset the reserved ``demo`` workspace to a single-contract pitch state.

    Hard-gated to slug ``demo`` only. Deletes operational data, reseeds the
    Sample Purchase Agreement and Buyer/Seller contacts, and ensures a demo owner.
    """
    owner_email = (owner_email or DEMO_OWNER_EMAIL_DEFAULT).lower().strip()
    tenant, _ = Tenant.objects.get_or_create(
        slug=DEMO_SLUG,
        defaults={"name": DEMO_NAME, "status": Tenant.Status.ACTIVE},
    )
    if tenant.slug != DEMO_SLUG:
        raise ValueError("Refusing to reset a non-demo tenant.")
    if tenant.name != DEMO_NAME:
        tenant.name = DEMO_NAME
    if tenant.status != Tenant.Status.ACTIVE:
        tenant.status = Tenant.Status.ACTIVE
    tenant.save()

    _wipe_tenant_operational_data(tenant)

    ensure_email_templates(tenant)
    from apps.documents.form_library.ensure import ensure_form_library

    ensure_form_library(tenant, replace=True)

    from apps.contacts.models import Contact

    for row in DEMO_CONTACTS:
        Contact.objects.update_or_create(
            tenant=tenant,
            email=row["email"],
            defaults={
                "first_name": row["first_name"],
                "last_name": row["last_name"],
                "is_archived": False,
            },
        )

    user = User.objects.filter(email__iexact=owner_email).first()
    password_set = False
    if user is None:
        password = owner_password or "demo-owner-change-me"
        user = User.objects.create_user(
            email=owner_email,
            password=password,
            first_name=owner_first_name,
            last_name=owner_last_name,
        )
        password_set = True
    elif owner_password:
        user.set_password(owner_password)
        user.save(update_fields=["password"])
        password_set = True

    membership, _ = Membership.objects.get_or_create(
        tenant=tenant,
        user=user,
        defaults={"role": Membership.Role.OWNER, "is_active": True},
    )
    if membership.role != Membership.Role.OWNER or not membership.is_active:
        membership.role = Membership.Role.OWNER
        membership.is_active = True
        membership.save(update_fields=["role", "is_active", "updated_at"])

    return ResetDemoResult(tenant=tenant, owner_email=owner_email, password_set=password_set)


def _wipe_tenant_operational_data(tenant: Tenant) -> None:
    """Delete envelopes, docs, contacts, and invites for a tenant (demo only)."""
    if tenant.slug != DEMO_SLUG:
        raise ValueError("Refusing to wipe a non-demo tenant.")

    from apps.contacts.models import (
        Activity,
        Company,
        Contact,
        FollowUpPlan,
        FollowUpPlanEnrollment,
        FollowUpTask,
        Listing,
    )
    from apps.documents.models import Document, DocumentVersion, Template
    from apps.envelopes.models import Envelope

    for envelope in Envelope.objects.filter(tenant=tenant).iterator():
        _delete_file_field(envelope.signed_file)
        _delete_file_field(envelope.certificate_file)
    Envelope.objects.filter(tenant=tenant).delete()

    FollowUpPlanEnrollment.objects.filter(tenant=tenant).delete()
    FollowUpTask.objects.filter(tenant=tenant).delete()
    FollowUpPlan.objects.filter(tenant=tenant).delete()
    Activity.objects.filter(tenant=tenant).delete()
    Listing.objects.filter(tenant=tenant).delete()
    Contact.objects.filter(tenant=tenant).delete()
    Company.objects.filter(tenant=tenant).delete()

    # Templates PROTECT documents — delete templates first, then versions/files/docs.
    Template.objects.filter(tenant=tenant).delete()
    for version in DocumentVersion.objects.filter(tenant=tenant).iterator():
        _delete_file_field(version.file)
    Document.objects.filter(tenant=tenant).delete()

    Invitation.objects.filter(tenant=tenant).delete()
