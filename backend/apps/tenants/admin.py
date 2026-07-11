from django.contrib import admin

from .models import Membership, Tenant


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "status", "created_at")
    search_fields = ("name", "slug")
    list_filter = ("status",)


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ("tenant", "user", "role", "is_active", "created_at")
    list_filter = ("role", "is_active")
    search_fields = ("tenant__slug", "user__email")
