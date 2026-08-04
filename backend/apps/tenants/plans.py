"""Plan definitions and usage / quota helpers."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.db.models import Count
from django.utils import timezone

PLAN_STARTER = "starter"
PLAN_PROFESSIONAL = "professional"
PLAN_ENTERPRISE = "enterprise"

PLAN_CHOICES = (
    (PLAN_STARTER, "Starter"),
    (PLAN_PROFESSIONAL, "Professional"),
    (PLAN_ENTERPRISE, "Enterprise"),
)

# None = unlimited
PLAN_LIMITS: dict[str, dict[str, Any]] = {
    PLAN_STARTER: {
        "max_seats": 3,
        "max_envelopes_per_month": 25,
        "listings_enabled_default": False,
    },
    PLAN_PROFESSIONAL: {
        "max_seats": 15,
        "max_envelopes_per_month": 200,
        "listings_enabled_default": True,
    },
    PLAN_ENTERPRISE: {
        "max_seats": None,
        "max_envelopes_per_month": None,
        "listings_enabled_default": True,
    },
}


def normalize_plan(plan: str | None) -> str:
    key = (plan or PLAN_STARTER).strip().lower()
    if key not in PLAN_LIMITS:
        return PLAN_STARTER
    return key


def plan_limits(tenant) -> dict[str, Any]:
    return dict(PLAN_LIMITS[normalize_plan(getattr(tenant, "plan", None))])


def _month_window_start():
    now = timezone.now()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def active_seat_count(tenant) -> int:
    return tenant.memberships.filter(is_active=True).count()


def envelopes_sent_this_month(tenant) -> int:
    from apps.envelopes.models import Envelope

    start = _month_window_start()
    return (
        Envelope.objects.filter(tenant=tenant)
        .exclude(status=Envelope.Status.DRAFT)
        .filter(created_at__gte=start)
        .count()
    )


def usage_snapshot(tenant) -> dict[str, Any]:
    """Light usage for Platform tenant detail and entitlements."""
    from apps.envelopes.models import Envelope

    limits = plan_limits(tenant)
    seats = active_seat_count(tenant)
    sent_month = envelopes_sent_this_month(tenant)
    envelope_counts = {
        row["status"]: row["c"]
        for row in Envelope.objects.filter(tenant=tenant)
        .values("status")
        .annotate(c=Count("id"))
    }
    last_30 = timezone.now() - timedelta(days=30)
    envelopes_last_30 = Envelope.objects.filter(
        tenant=tenant, created_at__gte=last_30
    ).count()

    from apps.documents.models import Document, DocumentVersion

    document_count = Document.objects.filter(tenant=tenant).count()
    version_count = DocumentVersion.objects.filter(tenant=tenant).count()

    max_seats = limits["max_seats"]
    max_env = limits["max_envelopes_per_month"]
    return {
        "plan": normalize_plan(getattr(tenant, "plan", None)),
        "limits": limits,
        "seats_used": seats,
        "seats_remaining": None if max_seats is None else max(0, max_seats - seats),
        "envelopes_sent_this_month": sent_month,
        "envelopes_remaining_this_month": (
            None if max_env is None else max(0, max_env - sent_month)
        ),
        "envelope_counts": envelope_counts,
        "envelope_total": sum(envelope_counts.values()),
        "envelopes_last_30_days": envelopes_last_30,
        "document_count": document_count,
        "document_version_count": version_count,
        "seat_quota_exceeded": max_seats is not None and seats >= max_seats,
        "envelope_quota_exceeded": max_env is not None and sent_month >= max_env,
    }


def assert_seat_available(tenant) -> None:
    from rest_framework.exceptions import ValidationError

    limits = plan_limits(tenant)
    max_seats = limits["max_seats"]
    if max_seats is None:
        return
    if active_seat_count(tenant) >= max_seats:
        raise ValidationError(
            {
                "detail": (
                    f"Seat limit reached for the {normalize_plan(tenant.plan)} plan "
                    f"({max_seats} seats). Upgrade or deactivate a member."
                ),
                "code": "seat_quota_exceeded",
            }
        )


def assert_envelope_send_allowed(tenant) -> None:
    from rest_framework.exceptions import ValidationError

    limits = plan_limits(tenant)
    max_env = limits["max_envelopes_per_month"]
    if max_env is None:
        return
    if envelopes_sent_this_month(tenant) >= max_env:
        raise ValidationError(
            {
                "detail": (
                    f"Monthly envelope limit reached for the {normalize_plan(tenant.plan)} "
                    f"plan ({max_env}/month). Upgrade or wait until next month."
                ),
                "code": "envelope_quota_exceeded",
            }
        )
