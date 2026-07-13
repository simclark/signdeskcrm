from django.db.models import Count, ProtectedError
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.documents.models import Document, Template
from apps.documents.serializers import (
    DocumentSerializer,
    DocumentUploadSerializer,
    TemplateSerializer,
)
from apps.tenants.permissions import IsTenantMember


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
        # Re-fetch with usage annotations for a consistent response shape.
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
    search_fields = ("name",)

    def get_queryset(self):
        qs = (
            Template.objects.for_tenant(self.request.tenant)
            .filter(is_archived=False)
            .select_related("document")
            .prefetch_related("document__versions")
        )
        # Selection UIs pass ?active=true so inactive templates stay editable
        # on the management list but are hidden from envelope dropdowns.
        active = self.request.query_params.get("active")
        if active is not None:
            qs = qs.filter(is_active=active.lower() in ("1", "true", "yes"))
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant, created_by=self.request.user)

    def perform_destroy(self, instance):
        instance.is_archived = True
        instance.save(update_fields=["is_archived", "updated_at"])
