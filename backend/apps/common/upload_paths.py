"""Tenant-scoped FileField upload_to helpers for Spaces / local media."""

from __future__ import annotations

from django.utils import timezone
from django.utils.deconstruct import deconstructible
from django.utils.text import get_valid_filename


def _tenant_key(instance) -> str:
    """Resolve a stable tenant key for path prefixes."""
    tenant_id = getattr(instance, "tenant_id", None)
    if tenant_id:
        return str(tenant_id)
    tenant = getattr(instance, "tenant", None)
    if tenant is not None and getattr(tenant, "pk", None):
        return str(tenant.pk)
    # Tenant model itself (logo/icon) — prefer pk, then slug
    pk = getattr(instance, "pk", None)
    if pk:
        return str(pk)
    slug = getattr(instance, "slug", None)
    if slug:
        return str(slug)
    return "pending"


@deconstructible
class TenantDatedUploadTo:
    """``tenants/<tenant_id>/<category>/<YYYY>/<MM>/<filename>``."""

    def __init__(self, category: str):
        self.category = category

    def __call__(self, instance, filename: str) -> str:
        stamp = timezone.now().strftime("%Y/%m")
        safe = get_valid_filename(filename)
        return f"tenants/{_tenant_key(instance)}/{self.category}/{stamp}/{safe}"

    def __eq__(self, other):
        return isinstance(other, TenantDatedUploadTo) and self.category == other.category


@deconstructible
class TenantBrandingUploadTo:
    """``tenants/<tenant_id>/branding/<logo|icon>/<filename>``."""

    def __init__(self, kind: str):
        self.kind = kind

    def __call__(self, instance, filename: str) -> str:
        safe = get_valid_filename(filename)
        return f"tenants/{_tenant_key(instance)}/branding/{self.kind}/{safe}"

    def __eq__(self, other):
        return isinstance(other, TenantBrandingUploadTo) and self.kind == other.kind


# Stable instances for model Field defaults / migrations
document_upload_to = TenantDatedUploadTo("documents")
signed_upload_to = TenantDatedUploadTo("signed")
certificate_upload_to = TenantDatedUploadTo("certificates")
signature_upload_to = TenantDatedUploadTo("signatures")
tenant_logo_upload_to = TenantBrandingUploadTo("logo")
tenant_icon_upload_to = TenantBrandingUploadTo("icon")


def is_tenant_prefixed(name: str | None) -> bool:
    return bool(name) and name.startswith("tenants/")
