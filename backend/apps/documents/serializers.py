from pypdf import PdfReader
from rest_framework import serializers

from apps.documents.models import Document, DocumentVersion, Template


class DocumentVersionSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = DocumentVersion
        fields = (
            "id",
            "version_number",
            "page_count",
            "sha256",
            "byte_size",
            "file_url",
            "created_at",
        )
        read_only_fields = fields

    def get_file_url(self, obj):
        request = self.context.get("request")
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url if obj.file else None


class DocumentSerializer(serializers.ModelSerializer):
    current_version = DocumentVersionSerializer(read_only=True)

    class Meta:
        model = Document
        fields = ("id", "title", "original_filename", "current_version", "created_at")
        read_only_fields = ("id", "original_filename", "current_version", "created_at")


class DocumentUploadSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    file = serializers.FileField()

    def create(self, validated_data):
        request = self.context["request"]
        uploaded = validated_data["file"]
        title = validated_data.get("title") or uploaded.name.rsplit(".", 1)[0]
        document = Document.objects.create(
            tenant=request.tenant,
            title=title,
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
            reader = PdfReader(version.file.path)
            version.page_count = len(reader.pages) or 1
        except Exception:
            version.page_count = 1
        version.compute_hash()
        version.save(update_fields=["page_count", "sha256", "byte_size"])
        return document


class TemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Template
        fields = (
            "id",
            "name",
            "document",
            "field_layout",
            "is_archived",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
