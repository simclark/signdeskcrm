"""JWT blacklist helpers for logout and password rotation."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def blacklist_refresh_token(raw_refresh: str) -> None:
    from rest_framework_simplejwt.tokens import RefreshToken

    token = RefreshToken(raw_refresh)
    token.blacklist()


def blacklist_user_outstanding_tokens(user) -> int:
    """Blacklist all outstanding refresh tokens for a user (password change/reset)."""
    try:
        from rest_framework_simplejwt.token_blacklist.models import (
            BlacklistedToken,
            OutstandingToken,
        )
    except Exception:  # noqa: BLE001
        logger.warning("token_blacklist unavailable; skipping JWT revocation")
        return 0

    count = 0
    for outstanding in OutstandingToken.objects.filter(user=user):
        _, created = BlacklistedToken.objects.get_or_create(token=outstanding)
        if created:
            count += 1
    return count
