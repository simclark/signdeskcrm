from pypdf import PdfReader
from rest_framework import serializers

from apps.common.media import protected_media_url
from apps.common.storage_utils import field_file_stream
from apps.documents.models import (
    ALLOWED_TEMPLATE_FIELD_TYPES,
    Document,
    DocumentVersion,
    Template,
)


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
        return protected_media_url(request, obj.file)


class DocumentSerializer(serializers.ModelSerializer):
    current_version = DocumentVersionSerializer(read_only=True)
    template_count = serializers.IntegerField(read_only=True, required=False)
    envelope_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Document
        fields = (
            "id",
            "title",
            "original_filename",
            "current_version",
            "created_at",
            "template_count",
            "envelope_count",
        )
        read_only_fields = (
            "id",
            "original_filename",
            "current_version",
            "created_at",
            "template_count",
            "envelope_count",
        )


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
            reader = PdfReader(field_file_stream(version.file))
            version.page_count = len(reader.pages) or 1
        except Exception:
            version.page_count = 1
        version.compute_hash()
        version.save(update_fields=["page_count", "sha256", "byte_size"])
        return document


def validate_field_layout(value, page_count=None):
    if value is None:
        return []
    if not isinstance(value, list):
        raise serializers.ValidationError("field_layout must be a list.")
    cleaned = []
    for idx, item in enumerate(value):
        if not isinstance(item, dict):
            raise serializers.ValidationError(f"field_layout[{idx}] must be an object.")
        field_type = item.get("field_type")
        if field_type not in ALLOWED_TEMPLATE_FIELD_TYPES:
            raise serializers.ValidationError(
                f"field_layout[{idx}].field_type must be one of: "
                f"{', '.join(sorted(ALLOWED_TEMPLATE_FIELD_TYPES))}."
            )
        try:
            page = int(item.get("page", 1))
            x = float(item["x"])
            y = float(item["y"])
            w = float(item["w"])
            h = float(item["h"])
        except (KeyError, TypeError, ValueError) as exc:
            raise serializers.ValidationError(
                f"field_layout[{idx}] requires numeric page, x, y, w, h."
            ) from exc
        if page < 1:
            raise serializers.ValidationError(f"field_layout[{idx}].page must be >= 1.")
        if page_count is not None and page > page_count:
            raise serializers.ValidationError(
                f"field_layout[{idx}].page ({page}) exceeds document page count ({page_count})."
            )
        for name, coord in (("x", x), ("y", y), ("w", w), ("h", h)):
            if coord < 0 or coord > 1:
                raise serializers.ValidationError(
                    f"field_layout[{idx}].{name} must be between 0 and 1."
                )
        if x + w > 1.0001 or y + h > 1.0001:
            raise serializers.ValidationError(
                f"field_layout[{idx}] extends outside the page bounds."
            )
        fill_mode = str(item.get("fill_mode") or "").strip().lower()
        merge_token = str(item.get("merge_token") or "")[:128]
        if fill_mode not in ("signer", "document"):
            # Infer: shared merge tokens are document data; else signer
            if field_type in ("text", "date") and merge_token.startswith(
                ("listing.", "deal.", "custom.", "role.")
            ):
                fill_mode = "document"
            elif item.get("prefill_editable") is False:
                fill_mode = "signer"
            else:
                fill_mode = "signer"
        if field_type in ("signature", "initials", "checkbox"):
            fill_mode = "signer"

        raw_recipient = item.get("recipient_index", None if fill_mode == "document" else 0)
        if fill_mode == "document":
            if raw_recipient is None or raw_recipient == "":
                recipient_index = None
            else:
                try:
                    recipient_index = int(raw_recipient)
                except (TypeError, ValueError) as exc:
                    raise serializers.ValidationError(
                        f"field_layout[{idx}].recipient_index must be null or an integer."
                    ) from exc
                # Document fields are signer-neutral; coerce any assignee away.
                recipient_index = None
            role_key = ""
        else:
            try:
                recipient_index = int(0 if raw_recipient is None else raw_recipient)
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError(
                    f"field_layout[{idx}].recipient_index must be an integer >= 0."
                ) from exc
            if recipient_index < 0:
                raise serializers.ValidationError(
                    f"field_layout[{idx}].recipient_index must be >= 0."
                )
            role_key = str(item.get("role_key") or "")[:64]

        cleaned.append(
            {
                "field_type": field_type,
                "page": page,
                "x": x,
                "y": y,
                "w": w,
                "h": h,
                "required": bool(item.get("required", True)),
                "label": str(item.get("label") or "")[:255],
                "recipient_index": recipient_index,
                "role_key": role_key,
                "merge_token": merge_token,
                "fill_mode": fill_mode,
                "prefill_editable": bool(item.get("prefill_editable", True)),
            }
        )
    return cleaned


def validate_roles(value):
    if value is None:
        return []
    if not isinstance(value, list):
        raise serializers.ValidationError("roles must be a list.")
    cleaned = []
    seen = set()
    for idx, item in enumerate(value):
        if not isinstance(item, dict):
            raise serializers.ValidationError(f"roles[{idx}] must be an object.")
        key = str(item.get("key") or "").strip().lower().replace(" ", "_")[:64]
        label = str(item.get("label") or key or f"Signer {idx + 1}")[:128]
        if not key:
            key = f"signer_{idx + 1}"
        if key in seen:
            raise serializers.ValidationError(f"Duplicate role key: {key}")
        seen.add(key)
        try:
            order = int(item.get("order", idx + 1))
        except (TypeError, ValueError) as exc:
            raise serializers.ValidationError(
                f"roles[{idx}].order must be an integer."
            ) from exc
        cleaned.append({"key": key, "label": label, "order": max(1, order)})
    cleaned.sort(key=lambda r: r["order"])
    return cleaned


class TemplateSerializer(serializers.ModelSerializer):
    document_file_url = serializers.SerializerMethodField()
    page_count = serializers.SerializerMethodField()
    document_title = serializers.SerializerMethodField()

    class Meta:
        model = Template
        fields = (
            "id",
            "name",
            "document",
            "document_title",
            "document_file_url",
            "page_count",
            "field_layout",
            "roles",
            "category",
            "description",
            "is_library",
            "library_key",
            "is_active",
            "is_archived",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "document_title",
            "document_file_url",
            "page_count",
            "is_library",
            "library_key",
            "created_at",
            "updated_at",
        )

    def get_document_title(self, obj):
        return obj.document.title if obj.document_id else None

    def _current_version(self, obj):
        if not obj.document_id:
            return None
        return obj.document.current_version

    def get_document_file_url(self, obj):
        version = self._current_version(obj)
        if not version or not version.file:
            return None
        return protected_media_url(self.context.get("request"), version.file)
    def get_page_count(self, obj):
        version = self._current_version(obj)
        return version.page_count if version else None

    def validate_document(self, document):
        request = self.context.get("request")
        if request and document.tenant_id != request.tenant.id:
            raise serializers.ValidationError("Document not found.")
        if not document.current_version:
            raise serializers.ValidationError("Document has no PDF version.")
        return document

    def validate_field_layout(self, value):
        document = None
        if self.instance is not None:
            document = self.instance.document
        page_count = None
        if document and document.current_version:
            page_count = document.current_version.page_count
        return validate_field_layout(value, page_count=page_count)

    def validate_roles(self, value):
        return validate_roles(value)

    def validate(self, attrs):
        document = attrs.get("document")
        if document is None and self.instance is not None:
            document = self.instance.document
        if self.instance is None and document is None:
            raise serializers.ValidationError({"document": "This field is required."})
        if "field_layout" in attrs and document is not None:
            page_count = (
                document.current_version.page_count if document.current_version else None
            )
            attrs["field_layout"] = validate_field_layout(
                attrs["field_layout"], page_count=page_count
            )
        if "roles" in attrs:
            attrs["roles"] = validate_roles(attrs["roles"])
        return attrs

    def create(self, validated_data):
        validated_data.setdefault("field_layout", [])
        validated_data.setdefault("roles", [])
        return super().create(validated_data)
