from rest_framework.permissions import BasePermission, SAFE_METHODS

from apps.tenants.models import Membership


class IsTenantMember(BasePermission):
    message = "You must be a member of this workspace."

    def has_permission(self, request, view):
        tenant = getattr(request, "tenant", None)
        if not tenant or not request.user or not request.user.is_authenticated:
            return False
        return Membership.objects.filter(
            tenant=tenant, user=request.user, is_active=True
        ).exists()


class IsTenantAdmin(BasePermission):
    message = "Admin or owner role required."

    def has_permission(self, request, view):
        tenant = getattr(request, "tenant", None)
        if not tenant or not request.user or not request.user.is_authenticated:
            return False
        return Membership.objects.filter(
            tenant=tenant,
            user=request.user,
            is_active=True,
            role__in=[Membership.Role.OWNER, Membership.Role.ADMIN],
        ).exists()


class IsTenantOwner(BasePermission):
    def has_permission(self, request, view):
        tenant = getattr(request, "tenant", None)
        if not tenant or not request.user or not request.user.is_authenticated:
            return False
        return Membership.objects.filter(
            tenant=tenant,
            user=request.user,
            is_active=True,
            role=Membership.Role.OWNER,
        ).exists()


class ReadOnlyOrAdmin(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return IsTenantMember().has_permission(request, view)
        return IsTenantAdmin().has_permission(request, view)
