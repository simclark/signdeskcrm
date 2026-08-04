"""Tenant export / hard-delete for platform offboarding."""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone


def build_tenant_export(tenant) -> dict[str, Any]:
    """JSON-serializable workspace export (metadata + summaries, not PDF bytes)."""
    from apps.envelopes.models import Envelope
    from apps.tenants.plans import usage_snapshot

    members = [
        {
            "email": m.user.email,
            "full_name": m.user.full_name,
            "role": m.role,
            "is_active": m.is_active,
            "joined_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in tenant.memberships.select_related("user").order_by("id")
    ]
    envelopes = [
        {
            "id": e.id,
            "title": e.title,
            "status": e.status,
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "completed_at": (
                e.completed_at.isoformat()
                if getattr(e, "completed_at", None)
                else None
            ),
        }
        for e in Envelope.objects.filter(tenant=tenant).order_by("-created_at")[:500]
    ]
    return {
        "exported_at": timezone.now().isoformat(),
        "tenant": {
            "id": tenant.id,
            "name": tenant.name,
            "slug": tenant.slug,
            "status": tenant.status,
            "subscription_status": tenant.subscription_status,
            "plan": getattr(tenant, "plan", "starter"),
            "primary_contact_email": tenant.primary_contact_email,
            "primary_contact_name": tenant.primary_contact_name,
            "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
        },
        "usage": usage_snapshot(tenant),
        "members": members,
        "envelopes": envelopes,
        "envelope_count": Envelope.objects.filter(tenant=tenant).count(),
        "note": (
            "Metadata export only. Signed PDFs and certificates remain in object "
            "storage until purged via media orphan cleanup or retention jobs."
        ),
    }


def build_compliance_export(tenant) -> dict[str, Any]:
    """Audit + signing event export for counsel / regulator requests."""
    from apps.audit.models import AuditEvent
    from apps.tenants.models import PlatformOpsEvent

    audit_events = [
        {
            "id": ev.id,
            "event_type": ev.event_type,
            "envelope_id": ev.envelope_id,
            "actor_email": ev.actor_email,
            "actor_name": ev.actor_name,
            "created_at": ev.created_at.isoformat() if ev.created_at else None,
            "payload": ev.payload if hasattr(ev, "payload") else {},
        }
        for ev in AuditEvent.objects.filter(tenant=tenant).order_by("-created_at")[:2000]
    ]
    platform_ops = [
        {
            "id": ev.id,
            "action": ev.action,
            "actor_email": ev.actor_email,
            "created_at": ev.created_at.isoformat() if ev.created_at else None,
            "metadata": ev.metadata,
        }
        for ev in PlatformOpsEvent.objects.filter(tenant=tenant).order_by("-created_at")[
            :500
        ]
    ]
    return {
        "exported_at": timezone.now().isoformat(),
        "tenant_slug": tenant.slug,
        "tenant_id": tenant.id,
        "audit_events": audit_events,
        "platform_ops_events": platform_ops,
        "audit_event_count": AuditEvent.objects.filter(tenant=tenant).count(),
    }


@transaction.atomic
def delete_tenant_workspace(tenant) -> dict[str, Any]:
    """Hard-delete a tenant and cascaded rows. Returns a summary."""
    summary = {
        "id": tenant.id,
        "slug": tenant.slug,
        "name": tenant.name,
        "deleted_at": timezone.now().isoformat(),
    }
    tenant.delete()
    return summary
