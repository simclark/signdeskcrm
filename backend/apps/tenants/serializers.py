from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.text import slugify
from rest_framework import serializers

from apps.tenants.models import Membership, Tenant, validate_tenant_slug

User = get_user_model()


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = (
            "id",
            "name",
            "slug",
            "status",
            "accent_color",
            "timezone",
            "default_expiration_days",
            "logo",
            "created_at",
        )
        read_only_fields = ("id", "status", "created_at")


class MembershipSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = Membership
        fields = ("id", "email", "full_name", "role", "is_active", "created_at")
        read_only_fields = fields


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
        return {"tenant": tenant, "user": user}


class SlugAvailabilitySerializer(serializers.Serializer):
    slug = serializers.SlugField(max_length=63)

    def validate_slug(self, value):
        value = slugify(value)
        validate_tenant_slug(value)
        return value
