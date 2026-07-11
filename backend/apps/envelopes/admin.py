from django.contrib import admin

from .models import Envelope, Field, Recipient


class RecipientInline(admin.TabularInline):
    model = Recipient
    extra = 0


class FieldInline(admin.TabularInline):
    model = Field
    extra = 0


@admin.register(Envelope)
class EnvelopeAdmin(admin.ModelAdmin):
    list_display = ("title", "tenant", "status", "sent_at", "completed_at")
    list_filter = ("status",)
    inlines = [RecipientInline, FieldInline]


@admin.register(Recipient)
class RecipientAdmin(admin.ModelAdmin):
    list_display = ("email", "envelope", "status", "routing_order")


@admin.register(Field)
class FieldAdmin(admin.ModelAdmin):
    list_display = ("field_type", "envelope", "page", "recipient")
