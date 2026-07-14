from django.utils import timezone
from rest_framework import serializers

from apps.envelopes.models import Envelope, Field, Recipient
from apps.envelopes.services import validate_envelope_for_send


class FieldSerializer(serializers.ModelSerializer):
    recipient = serializers.PrimaryKeyRelatedField(
        queryset=Recipient.objects.all(),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = Field
        fields = (
            "id",
            "recipient",
            "field_type",
            "page",
            "x",
            "y",
            "w",
            "h",
            "required",
            "label",
            "merge_token",
            "fill_mode",
            "value",
            "completed_at",
        )
        # `value` is writable on draft prepare for merge/prefill; signing still
        # overwrites via the public signing API.
        read_only_fields = ("id", "completed_at")

    def validate(self, attrs):
        field_type = attrs.get("field_type")
        if self.instance is not None and field_type is None:
            field_type = self.instance.field_type
        fill_mode = attrs.get("fill_mode")
        if self.instance is not None and fill_mode is None:
            fill_mode = self.instance.fill_mode
        fill_mode = fill_mode or Field.FillMode.SIGNER
        if field_type in (
            Field.FieldType.SIGNATURE,
            Field.FieldType.INITIALS,
            Field.FieldType.CHECKBOX,
        ):
            fill_mode = Field.FillMode.SIGNER
            attrs["fill_mode"] = fill_mode
        elif fill_mode not in Field.FillMode.values:
            fill_mode = Field.FillMode.SIGNER
            attrs["fill_mode"] = fill_mode
        else:
            attrs["fill_mode"] = fill_mode

        recipient = attrs.get("recipient", serializers.empty)
        if recipient is serializers.empty and self.instance is not None:
            recipient = self.instance.recipient
        elif recipient is serializers.empty:
            recipient = None

        if fill_mode == Field.FillMode.DOCUMENT:
            if recipient is not None:
                raise serializers.ValidationError(
                    {"recipient": "Document data fields must not be assigned to a signer."}
                )
            attrs["recipient"] = None
        else:
            if recipient is None:
                raise serializers.ValidationError(
                    {"recipient": "Signer fields require a recipient."}
                )
            attrs["recipient"] = recipient
        return attrs


class RecipientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Recipient
        fields = (
            "id",
            "contact",
            "name",
            "email",
            "role",
            "role_key",
            "routing_order",
            "status",
            "sent_at",
            "viewed_at",
            "signed_at",
        )
        read_only_fields = ("id", "status", "sent_at", "viewed_at", "signed_at")


class EnvelopeSerializer(serializers.ModelSerializer):
    recipients = RecipientSerializer(many=True, required=False)
    fields = FieldSerializer(many=True, required=False)
    signed_file_url = serializers.SerializerMethodField()
    certificate_file_url = serializers.SerializerMethodField()
    document_file_url = serializers.SerializerMethodField()
    page_count = serializers.SerializerMethodField()

    class Meta:
        model = Envelope
        fields = (
            "id",
            "title",
            "message",
            "status",
            "routing",
            "document",
            "document_version",
            "template",
            "listing",
            "merge_data",
            "sent_at",
            "completed_at",
            "expires_at",
            "void_reason",
            "pre_sign_sha256",
            "post_sign_sha256",
            "signed_file_url",
            "certificate_file_url",
            "document_file_url",
            "page_count",
            "recipients",
            "fields",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "status",
            "document_version",
            "sent_at",
            "completed_at",
            "expires_at",
            "pre_sign_sha256",
            "post_sign_sha256",
            "signed_file_url",
            "certificate_file_url",
            "document_file_url",
            "page_count",
            "created_at",
            "updated_at",
        )

    def _document_version(self, obj):
        return obj.document_version or (obj.document.current_version if obj.document_id else None)

    def get_signed_file_url(self, obj):
        request = self.context.get("request")
        if obj.signed_file and request:
            return request.build_absolute_uri(obj.signed_file.url)
        return None

    def get_certificate_file_url(self, obj):
        request = self.context.get("request")
        if obj.certificate_file and request:
            return request.build_absolute_uri(obj.certificate_file.url)
        return None

    def get_document_file_url(self, obj):
        version = self._document_version(obj)
        if not version or not version.file:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(version.file.url)
        return version.file.url

    def get_page_count(self, obj):
        version = self._document_version(obj)
        return version.page_count if version else 1

    def create(self, validated_data):
        recipients_data = validated_data.pop("recipients", [])
        fields_data = validated_data.pop("fields", [])
        request = self.context["request"]
        envelope = Envelope.objects.create(
            tenant=request.tenant,
            created_by=request.user,
            **validated_data,
        )
        version = envelope.document.current_version
        if version:
            envelope.document_version = version
            envelope.save(update_fields=["document_version"])
        for r in recipients_data:
            Recipient.objects.create(tenant=request.tenant, envelope=envelope, **r)
        for f in fields_data:
            Field.objects.create(tenant=request.tenant, envelope=envelope, **f)
        return envelope

    def update(self, instance, validated_data):
        if instance.status != Envelope.Status.DRAFT:
            raise serializers.ValidationError("Only draft envelopes can be edited.")
        recipients_data = validated_data.pop("recipients", None)
        fields_data = validated_data.pop("fields", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        request = self.context["request"]
        if recipients_data is not None:
            instance.recipients.all().delete()
            for r in recipients_data:
                Recipient.objects.create(tenant=request.tenant, envelope=instance, **r)
        if fields_data is not None:
            instance.fields.all().delete()
            for f in fields_data:
                Field.objects.create(tenant=request.tenant, envelope=instance, **f)
        return instance


class EnvelopeListSerializer(serializers.ModelSerializer):
    recipient_count = serializers.IntegerField(source="recipients.count", read_only=True)

    class Meta:
        model = Envelope
        fields = (
            "id",
            "title",
            "status",
            "routing",
            "sent_at",
            "completed_at",
            "expires_at",
            "recipient_count",
            "created_at",
        )


class SendValidationSerializer(serializers.Serializer):
    def validate(self, attrs):
        envelope = self.context["envelope"]
        errors = validate_envelope_for_send(envelope)
        if errors:
            raise serializers.ValidationError({"errors": errors})
        return attrs
