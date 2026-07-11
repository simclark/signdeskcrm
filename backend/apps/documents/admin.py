from django.contrib import admin

from .models import Document, DocumentVersion, Template


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "tenant", "created_at")


@admin.register(DocumentVersion)
class DocumentVersionAdmin(admin.ModelAdmin):
    list_display = ("document", "version_number", "page_count", "sha256")


@admin.register(Template)
class TemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "tenant", "is_archived")
