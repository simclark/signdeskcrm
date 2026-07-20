from __future__ import annotations

import logging
import threading

from django.conf import settings
from django.http import HttpRequest, JsonResponse

from apps.tenants.models import Tenant

logger = logging.getLogger(__name__)
_thread_local = threading.local()

PLATFORM_SUBDOMAIN = "platform"


def get_current_tenant() -> Tenant | None:
    return getattr(_thread_local, "tenant", None)


def set_current_tenant(tenant: Tenant | None) -> None:
    _thread_local.tenant = tenant


def extract_subdomain(host: str, base_domain: str) -> str | None:
    host = host.split(":")[0].lower()
    base = base_domain.lower()
    if host in (base, f"www.{base}", "localhost", "127.0.0.1"):
        return None
    suffix = f".{base}"
    if host.endswith(suffix):
        sub = host[: -len(suffix)]
        if not sub or "." in sub:
            return None
        return sub
    return None


class TenantMiddleware:
    """Resolve tenant from Host subdomain and bind to request + thread-local."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest):
        set_current_tenant(None)
        request.tenant = None
        request.is_apex = True
        request.is_platform = False

        host = request.get_host()
        slug = extract_subdomain(host, settings.BASE_DOMAIN)
        # Also accept X-Tenant-Slug for API clients / Vite proxy in dev
        header_slug = request.headers.get("X-Tenant-Slug")
        if header_slug:
            slug = header_slug.strip().lower()

        if slug == PLATFORM_SUBDOMAIN:
            # Reserved ops console host — not a tenant workspace.
            request.is_apex = False
            request.is_platform = True
            request.tenant = None
            try:
                return self.get_response(request)
            finally:
                set_current_tenant(None)

        if slug:
            request.is_apex = False
            try:
                tenant = Tenant.objects.get(slug=slug)
            except Tenant.DoesNotExist:
                if not settings.DEBUG and not request.path.startswith("/api/health"):
                    return JsonResponse({"detail": "Unknown tenant."}, status=404)
                request.tenant = None
            else:
                if tenant.status != Tenant.Status.ACTIVE:
                    return JsonResponse({"detail": "Tenant suspended."}, status=403)
                request.tenant = tenant
                set_current_tenant(tenant)

        try:
            return self.get_response(request)
        finally:
            set_current_tenant(None)
