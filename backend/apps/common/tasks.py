"""Periodic Celery heartbeat for health checks."""

from __future__ import annotations

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from apps.common.health import CELERY_HEARTBEAT_KEY, CELERY_HEARTBEAT_MAX_AGE_SECONDS


@shared_task(name="apps.common.tasks.celery_heartbeat")
def celery_heartbeat():
    if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
        return {"ok": True, "mode": "eager"}
    import redis

    client = redis.from_url(settings.CELERY_BROKER_URL)
    client.setex(
        CELERY_HEARTBEAT_KEY,
        CELERY_HEARTBEAT_MAX_AGE_SECONDS,
        timezone.now().isoformat(),
    )
    return {"ok": True, "at": timezone.now().isoformat()}
