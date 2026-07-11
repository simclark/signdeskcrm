from django.contrib import admin

from .models import Activity, Company, Contact


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "tenant", "is_archived", "created_at")
    list_filter = ("is_archived",)


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ("email", "first_name", "last_name", "tenant", "is_archived")
    search_fields = ("email", "first_name", "last_name")


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ("kind", "tenant", "contact", "created_at")
    list_filter = ("kind",)
