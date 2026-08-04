"""Trial / subscription entitlement helpers for Tenant workspaces."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db.models import Q
from django.utils import timezone


def trial_days() -> int:
    return int(getattr(settings, "TRIAL_DAYS", 15))


def trial_warning_hours() -> int:
    return int(getattr(settings, "TRIAL_WARNING_HOURS", 24))


def default_trial_ends_at():
    return timezone.now() + timedelta(days=trial_days())


def sync_subscription_status(tenant) -> bool:
    """Flip trial → expired when past trial_ends_at. Returns True if saved."""
    from apps.tenants.models import Tenant

    if tenant.subscription_status != Tenant.SubscriptionStatus.TRIAL:
        return False
    if not tenant.trial_ends_at or timezone.now() < tenant.trial_ends_at:
        return False
    tenant.subscription_status = Tenant.SubscriptionStatus.EXPIRED
    tenant.save(update_fields=["subscription_status", "updated_at"])
    return True


def is_write_locked(tenant) -> bool:
    """True when the workspace should reject mutating API calls."""
    from apps.tenants.models import Tenant

    sync_subscription_status(tenant)
    locked_statuses = {
        Tenant.SubscriptionStatus.EXPIRED,
        Tenant.SubscriptionStatus.PAST_DUE,
        Tenant.SubscriptionStatus.CANCELED,
    }
    if tenant.subscription_status in locked_statuses:
        return True
    if tenant.subscription_status == Tenant.SubscriptionStatus.TRIAL:
        if tenant.trial_ends_at and timezone.now() >= tenant.trial_ends_at:
            return True
    return False


def write_unlocked_tenant_q(*, prefix: str = "tenant") -> Q:
    """ORM filter for tenants that may send outbound automation email.

    ``prefix`` is the FK path to Tenant (e.g. ``\"tenant\"`` on Recipient).
    """
    from apps.tenants.models import Tenant

    now = timezone.now()
    p = f"{prefix}__" if prefix else ""
    return Q(**{f"{p}status": Tenant.Status.ACTIVE}) & (
        Q(**{f"{p}subscription_status": Tenant.SubscriptionStatus.ACTIVE})
        | Q(
            **{
                f"{p}subscription_status": Tenant.SubscriptionStatus.TRIAL,
                f"{p}trial_ends_at__gt": now,
            }
        )
        | Q(
            **{
                f"{p}subscription_status": Tenant.SubscriptionStatus.TRIAL,
                f"{p}trial_ends_at__isnull": True,
            }
        )
    )


def days_remaining(tenant) -> int | None:
    """Whole days left on an active trial (ceiled); None when not applicable."""
    import math

    from apps.tenants.models import Tenant

    if tenant.subscription_status != Tenant.SubscriptionStatus.TRIAL:
        return None
    if not tenant.trial_ends_at:
        return None
    seconds = (tenant.trial_ends_at - timezone.now()).total_seconds()
    if seconds <= 0:
        return 0
    return max(0, math.ceil(seconds / 86400))


def hours_remaining(tenant) -> int | None:
    import math

    from apps.tenants.models import Tenant

    if tenant.subscription_status != Tenant.SubscriptionStatus.TRIAL:
        return None
    if not tenant.trial_ends_at:
        return None
    seconds = (tenant.trial_ends_at - timezone.now()).total_seconds()
    if seconds <= 0:
        return 0
    return max(0, math.ceil(seconds / 3600))


def entitlement_payload(tenant) -> dict[str, Any]:
    sync_subscription_status(tenant)
    return {
        "subscription_status": tenant.subscription_status,
        "trial_ends_at": tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
        "is_write_locked": is_write_locked(tenant),
        "days_remaining": days_remaining(tenant),
        "support_email": getattr(settings, "SUPPORT_EMAIL", "support@signdeskcrm.com"),
        "billing_portal_available": bool(
            getattr(settings, "BILLING_PORTAL_AVAILABLE", False)
        ),
    }


def apply_new_tenant_trial(tenant) -> None:
    """Set a fresh 15-day trial on a newly created tenant (in-memory + save)."""
    from apps.tenants.models import Tenant

    tenant.subscription_status = Tenant.SubscriptionStatus.TRIAL
    tenant.trial_ends_at = default_trial_ends_at()
    tenant.trial_warning_sent_at = None
    tenant.save(
        update_fields=[
            "subscription_status",
            "trial_ends_at",
            "trial_warning_sent_at",
            "updated_at",
        ]
    )


def extend_trial(tenant, *, days: int | None = None, until=None) -> None:
    """Extend (or restart) the free trial. Clears warning if end is > warning window."""
    from apps.tenants.models import Tenant

    now = timezone.now()
    if until is not None:
        new_end = until
    else:
        days = days if days is not None else trial_days()
        base = tenant.trial_ends_at if tenant.trial_ends_at and tenant.trial_ends_at > now else now
        new_end = base + timedelta(days=days)

    tenant.subscription_status = Tenant.SubscriptionStatus.TRIAL
    tenant.trial_ends_at = new_end
    warning_cutoff = now + timedelta(hours=trial_warning_hours())
    if new_end > warning_cutoff:
        tenant.trial_warning_sent_at = None
    tenant.save(
        update_fields=[
            "subscription_status",
            "trial_ends_at",
            "trial_warning_sent_at",
            "updated_at",
        ]
    )


def mark_subscription_active(tenant) -> None:
    """Comp / design-partner: full access, no trial clock."""
    from apps.tenants.models import Tenant

    tenant.subscription_status = Tenant.SubscriptionStatus.ACTIVE
    tenant.trial_ends_at = None
    tenant.trial_warning_sent_at = None
    tenant.save(
        update_fields=[
            "subscription_status",
            "trial_ends_at",
            "trial_warning_sent_at",
            "updated_at",
        ]
    )


def mark_subscription_past_due(tenant) -> None:
    """Stripe webhook: payment failed — workspace becomes write-locked."""
    from apps.tenants.models import Tenant

    tenant.subscription_status = Tenant.SubscriptionStatus.PAST_DUE
    tenant.save(update_fields=["subscription_status", "updated_at"])


def mark_subscription_canceled(tenant) -> None:
    """Stripe webhook: subscription canceled — workspace becomes write-locked."""
    from apps.tenants.models import Tenant

    tenant.subscription_status = Tenant.SubscriptionStatus.CANCELED
    tenant.trial_ends_at = None
    tenant.save(update_fields=["subscription_status", "trial_ends_at", "updated_at"])
