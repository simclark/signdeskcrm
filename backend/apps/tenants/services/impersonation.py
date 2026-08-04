"""Time-boxed staff impersonation helpers."""

from __future__ import annotations

from apps.tenants.models import Membership, SupportImpersonation


def create_impersonation(*, actor, tenant, target_user) -> SupportImpersonation:
    if not Membership.objects.filter(
        tenant=tenant, user=target_user, is_active=True
    ).exists():
        raise ValueError("Target user is not an active member of this workspace.")
    return SupportImpersonation.objects.create(
        tenant=tenant,
        target_user=target_user,
        actor=actor,
        actor_email=getattr(actor, "email", "") or "",
    )
