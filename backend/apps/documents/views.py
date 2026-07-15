import json
from pathlib import Path

from django.db.models import Count, ProtectedError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.documents.form_library.ensure import ensure_form_library
from apps.documents.merge import KNOWN_MERGE_TOKENS
from apps.documents.models import Document, DocumentVersion, Template
from apps.documents.pdf_import import extract_acroform_layout, layout_from_import_payload
from apps.documents.serializers import (
    DocumentSerializer,
    DocumentUploadSerializer,
    TemplateSerializer,
    validate_field_layout,
    validate_roles,
)
from apps.tenants.permissions import IsTenantAdmin, IsTenantMember


class DocumentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsTenantMember]
    serializer_class = DocumentSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    search_fields = ("title", "original_filename")
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return (
            Document.objects.for_tenant(self.request.tenant)
            .prefetch_related("versions")
            .annotate(
                template_count=Count("templates", distinct=True),
                envelope_count=Count("envelopes", distinct=True),
            )
            .order_by("-created_at")
        )

    def create(self, request, *args, **kwargs):
        serializer = DocumentUploadSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        document = serializer.save()
        document = self.get_queryset().get(pk=document.pk)
        return Response(
            DocumentSerializer(document, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
        except ProtectedError:
            return Response(
                {
                    "detail": (
                        "This document is used by templates or envelopes and cannot be deleted."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def perform_destroy(self, instance):
        instance.delete()


class TemplateViewSet(viewsets.ModelViewSet):
    permission_classes = [IsTenantMember]
    serializer_class = TemplateSerializer
    search_fields = ("name", "category", "description", "library_key")
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        qs = (
            Template.objects.for_tenant(self.request.tenant)
            .filter(is_archived=False)
            .select_related("document")
            .prefetch_related("document__versions")
        )
        active = self.request.query_params.get("active")
        if active is not None:
            qs = qs.filter(is_active=active.lower() in ("1", "true", "yes"))
        library = self.request.query_params.get("library")
        if library is not None:
            qs = qs.filter(is_library=library.lower() in ("1", "true", "yes"))
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        return qs

    def list(self, request, *args, **kwargs):
        library = request.query_params.get("library")
        if library is not None and library.lower() in ("1", "true", "yes"):
            ensure_form_library(request.tenant)
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(
            tenant=self.request.tenant,
            created_by=self.request.user,
            is_library=False,
            library_key=None,
        )

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.library_key:
            return Response(
                {
                    "detail": (
                        "Platform library forms cannot be edited. "
                        "Clone the template to customize it."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.library_key:
            return Response(
                {
                    "detail": (
                        "Platform library forms cannot be archived. "
                        "Clone the template if you need a workspace copy."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    def perform_destroy(self, instance):
        instance.is_archived = True
        instance.save(update_fields=["is_archived", "updated_at"])

    @action(detail=False, methods=["get"], url_path="merge-tokens")
    def merge_tokens(self, request):
        """Catalog of merge tokens for template/envelope field autocomplete."""
        return Response(
            {
                "tokens": KNOWN_MERGE_TOKENS,
                "groups": {
                    "contact": "Contact",
                    "company": "Company",
                    "listing": "Listing",
                    "deal": "Deal terms",
                    "custom": "Custom",
                    "role": "Recipient role",
                },
            }
        )

    @action(detail=True, methods=["post"])
    def clone(self, request, pk=None):
        """Clone a library (or any) template into a new editable tenant template."""
        source = self.get_object()
        name = (request.data.get("name") or f"{source.name} (copy)").strip()[:255]
        document = source.document
        template = Template.objects.create(
            tenant=request.tenant,
            name=name,
            document=document,
            field_layout=list(source.field_layout or []),
            roles=list(source.roles or []),
            category=source.category,
            description=source.description,
            is_library=False,
            library_key=None,
            is_active=True,
            created_by=request.user,
        )
        return Response(
            TemplateSerializer(template, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="add-to-library",
        permission_classes=[IsTenantAdmin],
    )
    def add_to_library(self, request, pk=None):
        """Promote a workspace template into the Form library (tenant-owned)."""
        template = self.get_object()
        if template.library_key:
            return Response(
                {"detail": "Platform library forms are already in the library."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if template.is_library:
            return Response(
                TemplateSerializer(template, context={"request": request}).data
            )
        template.is_library = True
        template.save(update_fields=["is_library", "updated_at"])
        return Response(
            TemplateSerializer(template, context={"request": request}).data
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="remove-from-library",
        permission_classes=[IsTenantAdmin],
    )
    def remove_from_library(self, request, pk=None):
        """Remove a tenant-promoted form from the library shelf."""
        template = self.get_object()
        if template.library_key:
            return Response(
                {
                    "detail": (
                        "Platform library forms cannot be removed from the library. "
                        "Clone the template to customize a workspace copy."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not template.is_library:
            return Response(
                TemplateSerializer(template, context={"request": request}).data
            )
        template.is_library = False
        template.save(update_fields=["is_library", "updated_at"])
        return Response(
            TemplateSerializer(template, context={"request": request}).data
        )

    @action(detail=False, methods=["post"], url_path="import")
    def import_template(self, request):
        """Import a PDF (+ optional JSON field map) as a new template.

        Tries AcroForm extraction first; falls back to provided `field_map` JSON
        (DocuSign-style or SignDesk layout). Empty layout is allowed for manual placement.
        Promote into Form library afterward via add-to-library.
        """
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "PDF file is required."}, status=status.HTTP_400_BAD_REQUEST)
        name = (request.data.get("name") or Path(uploaded.name).stem)[:255]
        roles_raw = request.data.get("roles") or "[]"
        field_map_raw = request.data.get("field_map") or "[]"
        if isinstance(roles_raw, str):
            try:
                roles_raw = json.loads(roles_raw or "[]")
            except json.JSONDecodeError:
                return Response({"detail": "roles must be valid JSON."}, status=400)
        if isinstance(field_map_raw, str):
            try:
                field_map_raw = json.loads(field_map_raw or "[]")
            except json.JSONDecodeError:
                return Response({"detail": "field_map must be valid JSON."}, status=400)

        try:
            roles = validate_roles(roles_raw)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=400)

        document = Document.objects.create(
            tenant=request.tenant,
            title=name,
            original_filename=uploaded.name,
            created_by=request.user,
        )
        version = DocumentVersion(
            tenant=request.tenant,
            document=document,
            version_number=1,
            file=uploaded,
        )
        version.save()
        try:
            from pypdf import PdfReader

            reader = PdfReader(version.file.path)
            version.page_count = len(reader.pages) or 1
        except Exception:
            version.page_count = 1
        version.compute_hash()
        version.save(update_fields=["page_count", "sha256", "byte_size"])

        acro_layout = extract_acroform_layout(version.file.path)
        import_source = "empty"
        if acro_layout:
            layout = acro_layout
            import_source = "acroform"
        elif field_map_raw:
            layout = layout_from_import_payload(field_map_raw, page_count=version.page_count)
            import_source = "field_map"
        else:
            layout = []
        try:
            layout = validate_field_layout(layout, page_count=version.page_count)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=400)

        category = (request.data.get("category") or "general")[:64]
        description = request.data.get("description") or ""

        template = Template.objects.create(
            tenant=request.tenant,
            name=name,
            document=document,
            field_layout=layout,
            roles=roles,
            category=category,
            description=description,
            is_library=False,
            library_key=None,
            is_active=True,
            created_by=request.user,
        )
        return Response(
            {
                **TemplateSerializer(template, context={"request": request}).data,
                "imported_field_count": len(layout),
                "import_source": import_source,
            },
            status=status.HTTP_201_CREATED,
        )
