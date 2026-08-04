"""Stripe Checkout / Customer Portal / webhook helpers."""

from __future__ import annotations

import logging
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)


def stripe_configured() -> bool:
    return bool(
        getattr(settings, "STRIPE_SECRET_KEY", "")
        and getattr(settings, "STRIPE_PRICE_ID", "")
    )


def billing_portal_available() -> bool:
    """True when Stripe Checkout/Portal can be offered to tenants."""
    if getattr(settings, "BILLING_PORTAL_AVAILABLE", False):
        return True
    return stripe_configured()


def _stripe():
    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def ensure_stripe_customer(tenant) -> str:
    stripe = _stripe()
    if tenant.stripe_customer_id:
        return tenant.stripe_customer_id
    customer = stripe.Customer.create(
        email=tenant.primary_contact_email or None,
        name=tenant.legal_name or tenant.name,
        metadata={"tenant_id": str(tenant.id), "tenant_slug": tenant.slug},
    )
    tenant.stripe_customer_id = customer["id"]
    tenant.save(update_fields=["stripe_customer_id", "updated_at"])
    return tenant.stripe_customer_id


def create_checkout_session(tenant, *, success_url: str, cancel_url: str) -> dict[str, Any]:
    if not stripe_configured():
        raise RuntimeError("Stripe is not configured.")
    stripe = _stripe()
    customer_id = ensure_stripe_customer(tenant)
    price_id = settings.STRIPE_PRICE_ID
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        client_reference_id=str(tenant.id),
        metadata={"tenant_id": str(tenant.id), "tenant_slug": tenant.slug},
        subscription_data={"metadata": {"tenant_id": str(tenant.id)}},
    )
    return {"id": session["id"], "url": session["url"]}


def create_portal_session(tenant, *, return_url: str) -> dict[str, Any]:
    if not stripe_configured():
        raise RuntimeError("Stripe is not configured.")
    stripe = _stripe()
    customer_id = ensure_stripe_customer(tenant)
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )
    return {"url": session["url"]}


def handle_stripe_webhook(payload: bytes, sig_header: str) -> dict[str, Any]:
    if not getattr(settings, "STRIPE_WEBHOOK_SECRET", ""):
        raise RuntimeError("STRIPE_WEBHOOK_SECRET is not configured.")
    stripe = _stripe()
    event = stripe.Webhook.construct_event(
        payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
    )
    etype = event["type"]
    data = event["data"]["object"]
    from apps.tenants.entitlements import (
        mark_subscription_active,
        mark_subscription_canceled,
        mark_subscription_past_due,
    )
    from apps.tenants.models import Tenant
    from apps.tenants.plans import normalize_plan
    from apps.tenants.services.ops_audit import log_platform_op

    tenant = _resolve_tenant(data)
    if tenant is None:
        logger.warning("Stripe webhook %s: tenant not resolved", etype)
        return {"ok": True, "ignored": True, "type": etype}

    if etype in ("checkout.session.completed", "customer.subscription.created"):
        sub_id = data.get("subscription") or data.get("id")
        if isinstance(sub_id, str) and sub_id.startswith("sub_"):
            tenant.stripe_subscription_id = sub_id
        cust = data.get("customer")
        if isinstance(cust, str):
            tenant.stripe_customer_id = cust
        plan = normalize_plan(
            (data.get("metadata") or {}).get("plan")
            or getattr(settings, "STRIPE_DEFAULT_PLAN", "professional")
        )
        tenant.plan = plan
        tenant.save(
            update_fields=[
                "stripe_subscription_id",
                "stripe_customer_id",
                "plan",
                "updated_at",
            ]
        )
        mark_subscription_active(tenant)
        log_platform_op(
            actor=None,
            action="subscription_activated",
            tenant=tenant,
            metadata={"source": "stripe", "event": etype},
        )
    elif etype == "customer.subscription.updated":
        status = data.get("status")
        if status == "active":
            mark_subscription_active(tenant)
        elif status in ("past_due", "unpaid"):
            mark_subscription_past_due(tenant)
        elif status in ("canceled", "incomplete_expired"):
            mark_subscription_canceled(tenant)
    elif etype in ("customer.subscription.deleted", "invoice.payment_failed"):
        if etype == "customer.subscription.deleted":
            mark_subscription_canceled(tenant)
        else:
            mark_subscription_past_due(tenant)
    return {"ok": True, "type": etype, "tenant_id": tenant.id}


def _resolve_tenant(data: dict) -> Any:
    from apps.tenants.models import Tenant

    meta = data.get("metadata") or {}
    tenant_id = meta.get("tenant_id") or data.get("client_reference_id")
    if tenant_id:
        try:
            return Tenant.objects.get(pk=int(tenant_id))
        except (Tenant.DoesNotExist, ValueError, TypeError):
            pass
    sub_id = data.get("subscription") if isinstance(data.get("subscription"), str) else data.get("id")
    if isinstance(sub_id, str) and sub_id.startswith("sub_"):
        found = Tenant.objects.filter(stripe_subscription_id=sub_id).first()
        if found:
            return found
    cust = data.get("customer")
    if isinstance(cust, str):
        return Tenant.objects.filter(stripe_customer_id=cust).first()
    return None
