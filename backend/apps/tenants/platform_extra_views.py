"""Additional platform ops endpoints (export, impersonation, email, staff, status)."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status, views
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from apps.common.health import run_health_checks
from apps.tenants.models import EmailDeliveryEvent, PlatformOpsEvent, Tenant
from apps.tenants.platform_permissions import (
    CAP_ADMIN,
    CAP_READ,
    CAP_SUPPORT,
    HasPlatformCapability,
    effective_platform_role,
)
from apps.tenants.services.impersonation import create_impersonation
from apps.tenants.services.offboard import (
    build_compliance_export,
    build_tenant_export,
    delete_tenant_workspace,
)
from apps.tenants.services.ops_audit import log_platform_op

User = get_user_model()

DELETE_CONFIRM = "DELETE WORKSPACE"


def _postmark_webhook_authorized(request, expected: str) -> bool:
    """Accept custom header, Basic Auth (Postmark UI), or ?secret= query."""
    import base64
    import hmac

    header = request.headers.get("X-SignDesk-Webhook-Secret", "")
    if header and hmac.compare_digest(header, expected):
        return True

    query_secret = request.query_params.get("secret") or ""
    if query_secret and hmac.compare_digest(query_secret, expected):
        return True

    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("basic "):
        try:
            decoded = base64.b64decode(auth.split(" ", 1)[1]).decode("utf-8")
            _user, password = decoded.split(":", 1)
        except Exception:  # noqa: BLE001
            return False
        return hmac.compare_digest(password, expected)

    return False


class PlatformTenantExportView(views.APIView):
    permission_classes = [IsAuthenticated, HasPlatformCapability]
    platform_capability = CAP_ADMIN

    def get(self, request, pk):
        try:
            tenant = Tenant.objects.get(pk=pk)
        except Tenant.DoesNotExist:
            return Response({"detail": "Tenant not found."}, status=status.HTTP_404_NOT_FOUND)
        payload = build_tenant_export(tenant)
        log_platform_op(
            actor=request.user,
            action=PlatformOpsEvent.Action.EXPORT,
            tenant=tenant,
            metadata={},
        )
        return Response(payload)


class PlatformTenantComplianceExportView(views.APIView):
    permission_classes = [IsAuthenticated, HasPlatformCapability]
    platform_capability = CAP_ADMIN

    def get(self, request, pk):
        try:
            tenant = Tenant.objects.get(pk=pk)
        except Tenant.DoesNotExist:
            return Response({"detail": "Tenant not found."}, status=status.HTTP_404_NOT_FOUND)
        payload = build_compliance_export(tenant)
        log_platform_op(
            actor=request.user,
            action=PlatformOpsEvent.Action.COMPLIANCE_EXPORT,
            tenant=tenant,
            metadata={"audit_event_count": payload.get("audit_event_count")},
        )
        return Response(payload)


class PlatformTenantDeleteView(views.APIView):
    permission_classes = [IsAuthenticated, HasPlatformCapability]
    platform_capability = CAP_ADMIN

    def post(self, request, pk):
        try:
            tenant = Tenant.objects.get(pk=pk)
        except Tenant.DoesNotExist:
            return Response({"detail": "Tenant not found."}, status=status.HTTP_404_NOT_FOUND)
        confirm_slug = (request.data.get("confirm") or "").strip()
        acknowledge = (request.data.get("acknowledge") or "").strip()
        if confirm_slug != tenant.slug:
            return Response(
                {"detail": "Type the tenant slug to confirm deletion."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if acknowledge != DELETE_CONFIRM:
            return Response(
                {"detail": f'acknowledge must be "{DELETE_CONFIRM}".'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if tenant.slug == "demo":
            return Response(
                {"detail": "Cannot delete the reserved demo tenant. Use Demo reset instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        log_platform_op(
            actor=request.user,
            action=PlatformOpsEvent.Action.DELETE,
            tenant=tenant,
            metadata={"slug": tenant.slug, "name": tenant.name},
        )
        summary = delete_tenant_workspace(tenant)
        return Response(summary)


class PlatformImpersonateView(views.APIView):
    permission_classes = [IsAuthenticated, HasPlatformCapability]
    platform_capability = CAP_SUPPORT

    def post(self, request, pk):
        try:
            tenant = Tenant.objects.get(pk=pk)
        except Tenant.DoesNotExist:
            return Response({"detail": "Tenant not found."}, status=status.HTTP_404_NOT_FOUND)
        user_id = request.data.get("user_id")
        if not user_id:
            return Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            target = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            session = create_impersonation(
                actor=request.user, tenant=tenant, target_user=target
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        url = tenant.frontend_url(f"/support-impersonate/{session.token}")
        log_platform_op(
            actor=request.user,
            action=PlatformOpsEvent.Action.IMPERSONATE,
            tenant=tenant,
            metadata={
                "target_user_id": target.id,
                "target_email": target.email,
                "expires_at": session.expires_at.isoformat(),
            },
        )
        return Response(
            {
                "token": session.token,
                "url": url,
                "expires_at": session.expires_at.isoformat(),
                "target_email": target.email,
            }
        )


class SupportImpersonateExchangeView(views.APIView):
    """Exchange a one-time impersonation token for JWTs on the tenant host."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, token):
        from apps.tenants.models import SupportImpersonation

        try:
            session = SupportImpersonation.objects.select_related(
                "tenant", "target_user", "actor"
            ).get(token=token)
        except SupportImpersonation.DoesNotExist:
            return Response({"detail": "Invalid token."}, status=status.HTTP_404_NOT_FOUND)
        if not session.is_usable:
            return Response(
                {"detail": "This impersonation link has expired or already been used."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        tenant = getattr(request, "tenant", None)
        if tenant and tenant.id != session.tenant_id:
            return Response(
                {"detail": "Open this link on the correct workspace host."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        session.mark_used()
        user = session.target_user
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "full_name": user.full_name,
                    "is_staff": user.is_staff,
                    "platform_role": effective_platform_role(user),
                },
                "impersonation": {
                    "actor_email": session.actor_email,
                    "tenant_slug": session.tenant.slug,
                    "expires_at": session.expires_at.isoformat(),
                },
            }
        )


class PlatformEmailEventsView(views.APIView):
    permission_classes = [IsAuthenticated, HasPlatformCapability]
    platform_capability = CAP_READ

    def get(self, request):
        qs = EmailDeliveryEvent.objects.all().order_by("-created_at")
        event_type = (request.query_params.get("type") or "").strip()
        if event_type:
            qs = qs.filter(event_type=event_type)
        tenant_id = request.query_params.get("tenant")
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        rows = [
            {
                "id": e.id,
                "event_type": e.event_type,
                "recipient": e.recipient,
                "tenant_id": e.tenant_id,
                "tenant_slug": e.tenant_slug,
                "message_id": e.message_id,
                "subject": e.subject,
                "description": e.description,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in qs[:200]
        ]
        return Response(rows)


class PlatformStaffListView(views.APIView):
    permission_classes = [IsAuthenticated, HasPlatformCapability]
    platform_capability = CAP_ADMIN

    def get(self, request):
        staff = User.objects.filter(is_staff=True).order_by("email")
        return Response(
            [
                {
                    "id": u.id,
                    "email": u.email,
                    "full_name": u.full_name,
                    "is_superuser": u.is_superuser,
                    "platform_role": effective_platform_role(u),
                    "is_active": u.is_active,
                }
                for u in staff
            ]
        )

    def patch(self, request):
        user_id = request.data.get("user_id")
        role = (request.data.get("platform_role") or "").strip()
        if role not in ("viewer", "support", "operator", "admin"):
            return Response(
                {"detail": "platform_role must be viewer, support, operator, or admin."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            target = User.objects.get(pk=user_id, is_staff=True)
        except User.DoesNotExist:
            return Response({"detail": "Staff user not found."}, status=status.HTTP_404_NOT_FOUND)
        if target.is_superuser and role != "admin":
            return Response(
                {"detail": "Superusers must remain admin."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        previous = target.platform_role
        target.platform_role = role
        target.save(update_fields=["platform_role"])
        log_platform_op(
            actor=request.user,
            action=PlatformOpsEvent.Action.STAFF_ROLE,
            tenant=None,
            metadata={
                "target_user_id": target.id,
                "target_email": target.email,
                "previous": previous,
                "platform_role": role,
            },
        )
        return Response(
            {
                "id": target.id,
                "email": target.email,
                "platform_role": effective_platform_role(target),
            }
        )


class PublicStatusView(views.APIView):
    """Coarse public status for uptime monitors (no secrets)."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        payload = run_health_checks(include_celery=True)
        checks = payload.get("checks") or {}
        total = len(checks) or 1
        passed = sum(
            1 for c in checks.values() if isinstance(c, str) and c.startswith("ok")
        )
        return Response(
            {
                "status": payload.get("status"),
                "checked_at": timezone.now().isoformat(),
                "slo": {
                    "checks_total": total,
                    "checks_passing": passed,
                    "pass_rate": round(passed / total, 3),
                },
                "checks": {
                    name: {"ok": isinstance(c, str) and c.startswith("ok")}
                    for name, c in checks.items()
                },
            }
        )


class PostmarkWebhookView(views.APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        from django.conf import settings

        expected = getattr(settings, "POSTMARK_WEBHOOK_SECRET", "") or ""
        if expected and not _postmark_webhook_authorized(request, expected):
            return Response(
                {"detail": "Invalid webhook secret."},
                status=status.HTTP_403_FORBIDDEN,
            )
        data = request.data if isinstance(request.data, dict) else {}
        record_type = (data.get("RecordType") or data.get("Type") or "Other").lower()
        mapping = {
            "delivery": EmailDeliveryEvent.EventType.DELIVERY,
            "bounce": EmailDeliveryEvent.EventType.BOUNCE,
            "spamcomplaint": EmailDeliveryEvent.EventType.COMPLAINT,
            "spam_complaint": EmailDeliveryEvent.EventType.COMPLAINT,
            "open": EmailDeliveryEvent.EventType.OPEN,
            "click": EmailDeliveryEvent.EventType.CLICK,
        }
        event_type = mapping.get(record_type.replace(" ", ""), EmailDeliveryEvent.EventType.OTHER)
        recipient = ""
        for key in ("Email", "Recipient", "OriginalRecipient"):
            val = data.get(key)
            if isinstance(val, str) and val.strip():
                recipient = val.lower().strip()
                break
            if isinstance(val, list) and val:
                recipient = str(val[0]).lower().strip()
                break
        bounced = data.get("Bounced")
        if not recipient and isinstance(bounced, list) and bounced:
            recipient = str(bounced[0].get("Email") or "").lower().strip()
        tenant = None
        tenant_slug = ""
        meta = data.get("Metadata") or {}
        if isinstance(meta, dict):
            slug = (meta.get("tenant_slug") or "").strip()
            if slug:
                tenant = Tenant.objects.filter(slug=slug).first()
                tenant_slug = slug
        if tenant is None and recipient:
            from apps.tenants.models import Membership

            membership = (
                Membership.objects.filter(user__email__iexact=recipient, is_active=True)
                .select_related("tenant")
                .first()
            )
            if membership:
                tenant = membership.tenant
                tenant_slug = tenant.slug
        EmailDeliveryEvent.objects.create(
            event_type=event_type,
            recipient=recipient,
            tenant=tenant,
            tenant_slug=tenant_slug,
            message_id=str(data.get("MessageID") or data.get("MessageId") or ""),
            subject=str(data.get("Subject") or "")[:512],
            description=str(
                data.get("Description")
                or data.get("Details")
                or data.get("Name")
                or ""
            )[:2000],
            raw=data,
        )
        return Response({"ok": True})


class StripeWebhookView(views.APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        from apps.tenants.services.stripe_billing import handle_stripe_webhook

        sig = request.headers.get("Stripe-Signature", "")
        try:
            result = handle_stripe_webhook(request.body, sig)
        except Exception as exc:  # noqa: BLE001
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)


class TenantBillingCheckoutView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.tenants.permissions import IsTenantAdmin
        from apps.tenants.services.stripe_billing import (
            billing_portal_available,
            create_checkout_session,
        )

        if not IsTenantAdmin().has_permission(request, self):
            return Response({"detail": "Admin required."}, status=status.HTTP_403_FORBIDDEN)
        if not billing_portal_available():
            return Response(
                {"detail": "Billing is not enabled."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        tenant = request.tenant
        success = request.data.get("success_url") or tenant.frontend_url(
            "/app/settings?billing=success"
        )
        cancel = request.data.get("cancel_url") or tenant.frontend_url(
            "/app/settings?billing=cancel"
        )
        try:
            session = create_checkout_session(
                tenant, success_url=success, cancel_url=cancel
            )
        except Exception as exc:  # noqa: BLE001
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(session)


class TenantBillingPortalView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.tenants.permissions import IsTenantAdmin
        from apps.tenants.services.stripe_billing import (
            billing_portal_available,
            create_portal_session,
        )

        if not IsTenantAdmin().has_permission(request, self):
            return Response({"detail": "Admin required."}, status=status.HTTP_403_FORBIDDEN)
        if not billing_portal_available():
            return Response(
                {"detail": "Billing is not enabled."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        tenant = request.tenant
        return_url = request.data.get("return_url") or tenant.frontend_url("/app/settings")
        try:
            session = create_portal_session(tenant, return_url=return_url)
        except Exception as exc:  # noqa: BLE001
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(session)
