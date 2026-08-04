"""Provision a tenant workspace (shared by CLI and platform API)."""

from __future__ import annotations

from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.text import slugify

from apps.tenants.entitlements import apply_new_tenant_trial
from apps.tenants.models import Invitation, Membership, Tenant, ensure_email_templates, validate_tenant_slug

User = get_user_model()


@dataclass
class ProvisionResult:
    tenant: Tenant
    user: object | None
    membership: Membership | None
    invitation: Invitation | None
    created: bool


@transaction.atomic
def provision_tenant(
    *,
    name: str,
    slug: str,
    owner_email: str,
    owner_first_name: str = "",
    owner_last_name: str = "",
    owner_password: str | None = None,
    invited_by=None,
) -> ProvisionResult:
    """Create a tenant and seed defaults.

    With ``owner_password``: create/link user as OWNER immediately.
    Without password: send an admin invitation so they set their own password.
    """
    slug = slugify(slug)
    validate_tenant_slug(slug)
    owner_email = owner_email.lower().strip()
    name = (name or "").strip()
    if not name:
        raise ValueError("Company name is required.")
    if Tenant.objects.filter(slug=slug).exists():
        raise ValueError(f"Tenant slug '{slug}' already exists.")

    contact_name = " ".join(
        part for part in (owner_first_name.strip(), owner_last_name.strip()) if part
    )
    tenant = Tenant.objects.create(
        name=name,
        slug=slug,
        primary_contact_email=owner_email,
        primary_contact_name=contact_name,
    )
    apply_new_tenant_trial(tenant)
    ensure_email_templates(tenant)
    from apps.documents.form_library.ensure import ensure_form_library

    ensure_form_library(tenant)

    if owner_password:
        user = User.objects.filter(email__iexact=owner_email).first()
        if user is None:
            user = User.objects.create_user(
                email=owner_email,
                password=owner_password,
                first_name=owner_first_name,
                last_name=owner_last_name,
            )
        elif Membership.objects.filter(user=user, tenant=tenant).exists():
            raise ValueError("User is already a member of this tenant.")
        membership = Membership.objects.create(
            tenant=tenant,
            user=user,
            role=Membership.Role.OWNER,
        )
        return ProvisionResult(
            tenant=tenant,
            user=user,
            membership=membership,
            invitation=None,
            created=True,
        )

    if Invitation.objects.filter(
        tenant=tenant,
        email__iexact=owner_email,
        accepted_at__isnull=True,
        revoked_at__isnull=True,
    ).exists():
        raise ValueError("A pending invitation already exists for this email.")

    invitation = Invitation.objects.create(
        tenant=tenant,
        email=owner_email,
        role=Invitation.Role.ADMIN,
        invited_by=invited_by,
    )
    from apps.tenants.tasks import send_member_invitation

    send_member_invitation.delay(invitation.id)
    return ProvisionResult(
        tenant=tenant,
        user=None,
        membership=None,
        invitation=invitation,
        created=True,
    )
