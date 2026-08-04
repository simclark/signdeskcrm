"""Account-side helpers (password reset issuance)."""

from __future__ import annotations

from django.conf import settings
from django.utils import timezone

from apps.accounts.models import PasswordResetToken

PLATFORM_SUBDOMAIN = "platform"


def platform_frontend_url(path: str = "/") -> str:
    """Build an absolute URL on the reserved platform ops host."""
    base = settings.BASE_DOMAIN
    port = settings.FRONTEND_PORT
    if base in ("localhost", "127.0.0.1") or base.endswith(".test"):
        host = f"{PLATFORM_SUBDOMAIN}.{base}:{port}"
    else:
        host = f"{PLATFORM_SUBDOMAIN}.{base}"
    return f"{settings.FRONTEND_PROTOCOL}://{host}{path}"


def issue_password_reset(*, user, tenant=None) -> PasswordResetToken:
    """Invalidate prior unused tokens for this user+scope, then create and email a new one.

    Pass ``tenant=None`` for platform staff resets (token is scoped to the platform host).
    """
    PasswordResetToken.objects.filter(
        user=user,
        tenant=tenant,
        used_at__isnull=True,
    ).update(used_at=timezone.now())
    reset = PasswordResetToken.objects.create(user=user, tenant=tenant)
    from apps.accounts.tasks import send_password_reset

    send_password_reset.delay(reset.id)
    return reset
