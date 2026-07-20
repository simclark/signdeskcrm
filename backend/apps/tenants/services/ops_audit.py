"""Append-only platform ops audit log."""

from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model

User = get_user_model()


def log_platform_op(
    *,
    actor,
    action: str,
    tenant=None,
    metadata: dict[str, Any] | None = None,
):
    """Record a staff platform action. Never raises to callers."""
    from apps.tenants.models import PlatformOpsEvent

    try:
        return PlatformOpsEvent.objects.create(
            actor=actor if getattr(actor, "is_authenticated", False) else None,
            actor_email=getattr(actor, "email", "") or "",
            action=action,
            tenant=tenant,
            tenant_slug=getattr(tenant, "slug", "") or "",
            metadata=metadata or {},
        )
    except Exception:  # noqa: BLE001 — audit must not break ops
        return None
