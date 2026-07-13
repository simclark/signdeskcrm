from django.contrib import admin

from .models import EmailTemplate, Invitation, Membership, Tenant


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "status", "created_at")
    search_fields = ("name", "slug")
    list_filter = ("status",)
    fields = (
        "name",
        "slug",
        "status",
        "legal_name",
        "website",
        "address_line1",
        "address_line2",
        "city",
        "state",
        "postal_code",
        "country",
        "primary_contact_name",
        "primary_contact_email",
        "primary_contact_phone",
        "logo",
        "icon",
        "accent_color",
        "timezone",
        "default_expiration_days",
        "reminders_enabled",
        "reminder_interval_hours",
        "reminder_max_count",
        "document_retention_days",
        "sender_support_email",
        "sender_support_phone",
        "paper_copy_fee_policy",
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


@admin.register(EmailTemplate)
class EmailTemplateAdmin(admin.ModelAdmin):
    list_display = ("tenant", "key", "subject", "updated_at")
    list_filter = ("key",)
    search_fields = ("tenant__slug", "subject", "body")
