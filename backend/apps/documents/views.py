from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser
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
    parser_classes = [MultiPartParser, FormParser]
    search_fields = ("title", "original_filename")
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return Document.objects.for_tenant(self.request.tenant).prefetch_related("versions")

    def create(self, request, *args, **kwargs):
        serializer = DocumentUploadSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        document = serializer.save()
        return Response(
            DocumentSerializer(document, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def perform_destroy(self, instance):
        instance.delete()


class TemplateViewSet(viewsets.ModelViewSet):
    permission_classes = [IsTenantMember]
    serializer_class = TemplateSerializer
    search_fields = ("name",)

    def get_queryset(self):
        return Template.objects.for_tenant(self.request.tenant).filter(is_archived=False)

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant, created_by=self.request.user)

    def perform_destroy(self, instance):
        instance.is_archived = True
        instance.save(update_fields=["is_archived", "updated_at"])
