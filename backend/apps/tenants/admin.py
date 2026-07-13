from django.contrib import admin

from .models import Invitation, Membership, Tenant


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "status", "created_at")
    search_fields = ("name", "slug")
    list_filter = ("status",)
    fields = (
        "name",
        "slug",
        "status",
        "logo",
        "icon",
        "accent_color",
        "timezone",
        "default_expiration_days",
        "esign_acknowledgement",
        "esign_acknowledgement_version",
    )
    readonly_fields = ("esign_acknowledgement_version",)


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ("tenant", "user", "role", "is_active", "created_at")
    list_filter = ("role", "is_active")
    search_fields = ("tenant__slug", "user__email")


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ("email", "tenant", "role", "expires_at", "accepted_at", "revoked_at", "created_at")
    list_filter = ("role",)
    search_fields = ("email", "tenant__slug", "token")
    readonly_fields = ("token", "accepted_at", "revoked_at")
