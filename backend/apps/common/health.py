"""Shared readiness / liveness helpers for public and platform health."""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.db import connection


CELERY_HEARTBEAT_KEY = "signdesk:celery:heartbeat"
CELERY_HEARTBEAT_MAX_AGE_SECONDS = 300


def check_database() -> str:
    try:
        connection.ensure_connection()
        return "ok"
    except Exception as exc:  # noqa: BLE001 — health must never raise
        return f"error: {exc.__class__.__name__}"


def check_redis() -> str:
    try:
        import redis

        client = redis.from_url(settings.CELERY_BROKER_URL)
        if client.ping() is not True:
            raise RuntimeError("ping failed")
        return "ok"
    except Exception as exc:  # noqa: BLE001
        return f"error: {exc.__class__.__name__}"


def check_celery() -> str:
    """Verify worker/beat recently wrote a heartbeat (or eager mode)."""
    if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
        return "ok (eager)"
    try:
        import redis

        client = redis.from_url(settings.CELERY_BROKER_URL)
        value = client.get(CELERY_HEARTBEAT_KEY)
        if not value:
            return "error: no recent heartbeat (is beat+worker running?)"
        return "ok"
    except Exception as exc:  # noqa: BLE001
        return f"error: {exc.__class__.__name__}"


def run_health_checks(*, include_celery: bool = True) -> dict[str, Any]:
    checks = {
        "database": check_database(),
        "redis": check_redis(),
    }
    if include_celery:
        checks["celery"] = check_celery()
    degraded = any(not str(v).startswith("ok") for v in checks.values())
    return {
        "status": "degraded" if degraded else "ok",
        "service": "signdesk-api",
        "checks": checks,
    }
