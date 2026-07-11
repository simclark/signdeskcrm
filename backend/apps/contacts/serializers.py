from rest_framework import serializers

from apps.contacts.models import Activity, Company, Contact


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = (
            "id",
            "name",
            "website",
            "notes",
            "is_archived",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class ContactSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True, default=None)

    class Meta:
        model = Contact
        fields = (
            "id",
            "company",
            "company_name",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "phone",
            "title",
            "notes",
            "is_archived",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "full_name", "company_name", "created_at", "updated_at")


class ActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Activity
        fields = (
            "id",
            "contact",
            "company",
            "kind",
            "message",
            "metadata",
            "created_at",
        )
        read_only_fields = fields
