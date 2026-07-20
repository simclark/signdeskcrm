"""Account-side helpers (password reset issuance)."""

from __future__ import annotations

from django.utils import timezone

from apps.accounts.models import PasswordResetToken


def issue_password_reset(*, user, tenant) -> PasswordResetToken:
    """Invalidate prior unused tokens for this user+tenant, then create and email a new one."""
    PasswordResetToken.objects.filter(
        user=user,
        tenant=tenant,
        used_at__isnull=True,
    ).update(used_at=timezone.now())
    reset = PasswordResetToken.objects.create(user=user, tenant=tenant)
    from apps.accounts.tasks import send_password_reset

    send_password_reset.delay(reset.id)
    return reset
