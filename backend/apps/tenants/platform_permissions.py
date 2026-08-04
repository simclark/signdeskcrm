"""Platform staff RBAC (viewer / support / operator / admin)."""

from __future__ import annotations

from rest_framework.permissions import BasePermission

# Capability strings used by HasPlatformCapability
CAP_READ = "read"
CAP_SUPPORT = "support"
CAP_OPERATE = "operate"
CAP_BILLING = "billing"
CAP_ADMIN = "admin"

ROLE_CAPABILITIES: dict[str, frozenset[str]] = {
    "viewer": frozenset({CAP_READ}),
    "support": frozenset({CAP_READ, CAP_SUPPORT}),
    "operator": frozenset({CAP_READ, CAP_SUPPORT, CAP_OPERATE}),
    "admin": frozenset({CAP_READ, CAP_SUPPORT, CAP_OPERATE, CAP_BILLING, CAP_ADMIN}),
}


def effective_platform_role(user) -> str | None:
    """Return platform role for a staff user, or None if not platform-eligible."""
    if not user or not getattr(user, "is_authenticated", False):
        return None
    if not getattr(user, "is_staff", False):
        return None
    if getattr(user, "is_superuser", False):
        return "admin"
    role = (getattr(user, "platform_role", None) or "").strip()
    if role in ROLE_CAPABILITIES:
        return role
    # Legacy staff without a role → admin (safe default for existing operators)
    return "admin"


def platform_capabilities(user) -> frozenset[str]:
    role = effective_platform_role(user)
    if not role:
        return frozenset()
    return ROLE_CAPABILITIES[role]


def has_platform_capability(user, capability: str) -> bool:
    return capability in platform_capabilities(user)


class IsPlatformStaff(BasePermission):
    """Any staff user with a platform role (replaces bare IsAdminUser for reads)."""

    message = "Platform staff access required."

    def has_permission(self, request, view):
        return effective_platform_role(request.user) is not None


class HasPlatformCapability(BasePermission):
    """Require a specific capability; set ``platform_capability`` on the view."""

    message = "Insufficient platform permissions."

    def has_permission(self, request, view):
        capability = getattr(view, "platform_capability", CAP_READ)
        return has_platform_capability(request.user, capability)
