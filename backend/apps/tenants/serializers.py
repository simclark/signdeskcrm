from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers

from apps.common.media import protected_media_url
from apps.tenants.email_templates import DEFAULT_TEMPLATES, EmailTemplateKey
from apps.tenants.entitlements import apply_new_tenant_trial, entitlement_payload
from apps.tenants.models import (
    EmailTemplate,
    Invitation,
    Membership,
    Tenant,
    ensure_email_templates,
    validate_tenant_slug,
)

User = get_user_model()


class TenantSerializer(serializers.ModelSerializer):
    entitlement = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = (
            "id",
            "name",
            "slug",
            "status",
            "legal_name",
            "website",
            "address_line1",
            "address_line2",
            "city",
            "state",
            "postal_code",
            "country",
            "primary_contact_name",
            "primary_contact_email",
            "primary_contact_phone",
            "accent_color",
            "timezone",
            "default_expiration_days",
            "logo",
            "icon",
            "reminders_enabled",
            "reminder_interval_hours",
            "reminder_max_count",
            "document_retention_days",
            "sender_support_email",
            "sender_support_phone",
            "paper_copy_fee_policy",
            "listings_enabled",
            "esign_acknowledgement",
            "esign_acknowledgement_version",
            "subscription_status",
            "trial_ends_at",
            "entitlement",
            "created_at",
        )
        read_only_fields = (
            "id",
            "slug",
            "status",
            "created_at",
            "esign_acknowledgement_version",
            "subscription_status",
            "trial_ends_at",
            "entitlement",
        )

    def get_entitlement(self, obj):
        return entitlement_payload(obj)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        data["logo"] = protected_media_url(request, instance.logo)
        data["icon"] = protected_media_url(request, instance.icon)
        return data

    def validate_timezone(self, value):
        value = (value or "").strip() or "UTC"
        try:
            from zoneinfo import ZoneInfo

            ZoneInfo(value)
        except Exception as exc:
            raise serializers.ValidationError("Enter a valid IANA timezone.") from exc
        return value

    def validate_default_expiration_days(self, value):
        if value < 1:
            raise serializers.ValidationError("Default expiration must be at least 1 day.")
        if value > 3650:
            raise serializers.ValidationError("Default expiration cannot exceed 3650 days.")
        return value

    def validate_reminder_interval_hours(self, value):
        if value < 1:
            raise serializers.ValidationError("Reminder interval must be at least 1 hour.")
        if value > 24 * 30:
            raise serializers.ValidationError("Reminder interval cannot exceed 30 days.")
        return value

    def validate_document_retention_days(self, value):
        if value is None:
            return value
        if value < 1:
            raise serializers.ValidationError("Retention must be at least 1 day, or blank to keep forever.")
        return value

    def validate_website(self, value):
        value = (value or "").strip()
        if not value:
            return ""
        if not value.startswith(("http://", "https://")):
            value = f"https://{value}"
        return value

    def update(self, instance, validated_data):
        new_text = validated_data.get("esign_acknowledgement")
        if new_text is not None and new_text != instance.esign_acknowledgement:
            from django.utils import timezone

            instance.esign_acknowledgement_version = timezone.now().strftime("%Y-%m-%d")
        return super().update(instance, validated_data)


class MembershipSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = Membership
        fields = ("id", "email", "full_name", "role", "is_active", "created_at")
        read_only_fields = ("id", "email", "full_name", "created_at")


class MembershipUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(
        choices=[Membership.Role.ADMIN, Membership.Role.MEMBER],
        required=False,
    )
    is_active = serializers.BooleanField(required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Provide role and/or is_active.")
        if "role" in attrs and attrs["role"] == Membership.Role.OWNER:
            raise serializers.ValidationError({"role": "Cannot assign owner via this endpoint."})
        return attrs


class SignupSerializer(serializers.Serializer):
    company_name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=63)
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, write_only=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate_slug(self, value):
        value = slugify(value)
        validate_tenant_slug(value)
        if Tenant.objects.filter(slug=value).exists():
            raise serializers.ValidationError("This subdomain is already taken.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value.lower()

    @transaction.atomic
    def create(self, validated_data):
        tenant = Tenant.objects.create(
            name=validated_data["company_name"],
            slug=validated_data["slug"],
        )
        apply_new_tenant_trial(tenant)
        user = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
        )
        Membership.objects.create(
            tenant=tenant,
            user=user,
            role=Membership.Role.OWNER,
        )
        ensure_email_templates(tenant)
        from apps.documents.form_library.ensure import ensure_form_library

        ensure_form_library(tenant)
        return {"tenant": tenant, "user": user}


class SlugAvailabilitySerializer(serializers.Serializer):
    slug = serializers.SlugField(max_length=63)

    def validate_slug(self, value):
        value = slugify(value)
        validate_tenant_slug(value)
        return value


class InvitationSerializer(serializers.ModelSerializer):
    invited_by_email = serializers.EmailField(source="invited_by.email", read_only=True, default=None)
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = Invitation
        fields = (
            "id",
            "email",
            "role",
            "invited_by_email",
            "expires_at",
            "accepted_at",
            "revoked_at",
            "is_expired",
            "created_at",
        )
        read_only_fields = (
            "id",
            "invited_by_email",
            "expires_at",
            "accepted_at",
            "revoked_at",
            "is_expired",
            "created_at",
        )


class CreateInvitationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(
        choices=Invitation.Role.choices,
        default=Invitation.Role.MEMBER,
    )

    def validate_email(self, value):
        email = value.lower().strip()
        tenant = self.context["tenant"]
        if Membership.objects.filter(
            tenant=tenant, user__email__iexact=email, is_active=True
        ).exists():
            raise serializers.ValidationError("This person is already a member of this workspace.")
        if Invitation.objects.filter(
            tenant=tenant,
            email__iexact=email,
            accepted_at__isnull=True,
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).exists():
            raise serializers.ValidationError("A pending invitation already exists for this email.")
        return email

    def create(self, validated_data):
        request = self.context["request"]
        tenant = self.context["tenant"]
        invitation = Invitation.objects.create(
            tenant=tenant,
            email=validated_data["email"],
            role=validated_data["role"],
            invited_by=request.user,
        )
        from apps.tenants.tasks import send_member_invitation

        send_member_invitation.delay(invitation.id)
        return invitation


class InvitationDetailSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.CharField()
    tenant_name = serializers.CharField()
    tenant_slug = serializers.CharField()
    expires_at = serializers.DateTimeField()
    user_exists = serializers.BooleanField()


class AcceptInvitationSerializer(serializers.Serializer):
    password = serializers.CharField(min_length=8, write_only=True, required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate(self, attrs):
        invitation = self.context["invitation"]
        existing = User.objects.filter(email__iexact=invitation.email).first()
        if existing is None:
            password = attrs.get("password") or ""
            if len(password) < 8:
                raise serializers.ValidationError(
                    {"password": "Password must be at least 8 characters."}
                )
            validate_password(password)
            attrs["password"] = password
            attrs["_existing_user"] = None
        else:
            attrs["_existing_user"] = existing
        return attrs

    @transaction.atomic
    def save(self, **kwargs):
        invitation = self.context["invitation"]
        if not invitation.is_usable:
            raise serializers.ValidationError("This invitation is no longer valid.")

        existing = self.validated_data["_existing_user"]
        if existing is not None:
            user = existing
            if Membership.objects.filter(tenant=invitation.tenant, user=user).exists():
                raise serializers.ValidationError("You are already a member of this workspace.")
        else:
            user = User.objects.create_user(
                email=invitation.email,
                password=self.validated_data["password"],
                first_name=self.validated_data.get("first_name", ""),
                last_name=self.validated_data.get("last_name", ""),
            )

        membership = Membership.objects.create(
            tenant=invitation.tenant,
            user=user,
            role=invitation.role,
        )
        invitation.accepted_at = timezone.now()
        invitation.save(update_fields=["accepted_at", "updated_at"])
        return {"user": user, "membership": membership, "tenant": invitation.tenant}


class EmailTemplateSerializer(serializers.ModelSerializer):
    label = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    available_placeholders = serializers.SerializerMethodField()
    cta_label = serializers.SerializerMethodField()

    class Meta:
        model = EmailTemplate
        fields = (
            "key",
            "label",
            "description",
            "subject",
            "body",
            "available_placeholders",
            "cta_label",
            "updated_at",
        )
        read_only_fields = (
            "key",
            "label",
            "description",
            "available_placeholders",
            "cta_label",
            "updated_at",
        )

    def get_label(self, obj) -> str:
        return DEFAULT_TEMPLATES[obj.key]["label"]

    def get_description(self, obj) -> str:
        return DEFAULT_TEMPLATES[obj.key]["description"]

    def get_available_placeholders(self, obj) -> list[str]:
        return list(DEFAULT_TEMPLATES[obj.key]["placeholders"])

    def get_cta_label(self, obj) -> str:
        return DEFAULT_TEMPLATES[obj.key]["cta_label"]

    def validate_subject(self, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Subject is required.")
        return value

    def validate_body(self, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Body is required.")
        return value

    def validate_key(self, value: str) -> str:
        if value not in EmailTemplateKey.ALL:
            raise serializers.ValidationError("Unknown email template.")
        return value


class EmailTemplateUpdateSerializer(serializers.Serializer):
    subject = serializers.CharField(max_length=255)
    body = serializers.CharField()

    def validate_subject(self, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Subject is required.")
        return value

    def validate_body(self, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Body is required.")
        return value

