from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.permissions import BasePermission, SAFE_METHODS

from apps.tenants.entitlements import is_write_locked
from apps.tenants.models import Membership


class TrialExpired(APIException):
    status_code = status.HTTP_402_PAYMENT_REQUIRED
    default_detail = (
        "Your free trial has ended. This workspace is read-only until you subscribe."
    )
    default_code = "trial_expired"

    def __init__(self, tenant=None, detail=None, code=None):
        if detail is None and tenant is not None:
            detail = {
                "detail": self.default_detail,
                "code": self.default_code,
                "trial_ends_at": (
                    tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None
                ),
            }
        super().__init__(detail=detail, code=code)


def _enforce_write_allowed(request) -> None:
    tenant = getattr(request, "tenant", None)
    if not tenant:
        return
    if request.method in SAFE_METHODS:
        return
    if is_write_locked(tenant):
        raise TrialExpired(tenant=tenant)


class IsTenantMember(BasePermission):
    message = "You must be a member of this workspace."

    def has_permission(self, request, view):
        tenant = getattr(request, "tenant", None)
        if not tenant or not request.user or not request.user.is_authenticated:
            return False
        if not Membership.objects.filter(
            tenant=tenant, user=request.user, is_active=True
        ).exists():
            return False
        _enforce_write_allowed(request)
        return True


class IsTenantAdmin(BasePermission):
    message = "Admin or owner role required."

    def has_permission(self, request, view):
        tenant = getattr(request, "tenant", None)
        if not tenant or not request.user or not request.user.is_authenticated:
            return False
        if not Membership.objects.filter(
            tenant=tenant,
            user=request.user,
            is_active=True,
            role__in=[Membership.Role.OWNER, Membership.Role.ADMIN],
        ).exists():
            return False
        _enforce_write_allowed(request)
        return True


class IsTenantOwner(BasePermission):
    def has_permission(self, request, view):
        tenant = getattr(request, "tenant", None)
        if not tenant or not request.user or not request.user.is_authenticated:
            return False
        if not Membership.objects.filter(
            tenant=tenant,
            user=request.user,
            is_active=True,
            role=Membership.Role.OWNER,
        ).exists():
            return False
        _enforce_write_allowed(request)
        return True


class ReadOnlyOrAdmin(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return IsTenantMember().has_permission(request, view)
        return IsTenantAdmin().has_permission(request, view)
