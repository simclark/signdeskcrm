from django.contrib import admin

from .models import (
    Activity,
    Cadence,
    CadenceEnrollment,
    CadenceStep,
    Company,
    Contact,
    FollowUpTask,
    Listing,
)


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "tenant", "is_archived", "created_at")
    list_filter = ("is_archived",)


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = (
        "email",
        "first_name",
        "last_name",
        "stage",
        "next_follow_up_at",
        "tenant",
        "is_archived",
    )
    search_fields = ("email", "first_name", "last_name")
    list_filter = ("stage", "is_archived")


@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    list_display = ("address", "city", "mls_number", "price", "tenant", "is_archived")
    search_fields = ("address", "mls_number", "city")


@admin.register(FollowUpTask)
class FollowUpTaskAdmin(admin.ModelAdmin):
    list_display = ("title", "contact", "due_at", "status", "tenant")
    list_filter = ("status",)


@admin.register(Cadence)
class CadenceAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "tenant", "is_archived")


@admin.register(CadenceStep)
class CadenceStepAdmin(admin.ModelAdmin):
    list_display = ("cadence", "order", "offset_days", "subject", "tenant")


@admin.register(CadenceEnrollment)
class CadenceEnrollmentAdmin(admin.ModelAdmin):
    list_display = ("contact", "cadence", "status", "next_run_at", "tenant")
    list_filter = ("status",)


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ("kind", "tenant", "contact", "created_at")
    list_filter = ("kind",)
