from rest_framework import serializers

from apps.contacts.models import (
    Activity,
    Cadence,
    CadenceEnrollment,
    CadenceStep,
    Company,
    Contact,
    FollowUpTask,
    Listing,
)


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
            "stage",
            "tags",
            "next_follow_up_at",
            "is_archived",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "full_name", "company_name", "created_at", "updated_at")

    def validate_tags(self, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("tags must be a list of strings.")
        return [str(t).strip()[:64] for t in value if str(t).strip()][:40]


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


class ListingSerializer(serializers.ModelSerializer):
    full_address = serializers.CharField(read_only=True)

    class Meta:
        model = Listing
        fields = (
            "id",
            "address",
            "city",
            "state",
            "postal_code",
            "mls_number",
            "price",
            "beds",
            "baths",
            "sqft",
            "year_built",
            "description",
            "source",
            "raw_data",
            "full_address",
            "is_archived",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "full_address", "created_at", "updated_at")


class FollowUpTaskSerializer(serializers.ModelSerializer):
    contact_name = serializers.CharField(source="contact.full_name", read_only=True)

    class Meta:
        model = FollowUpTask
        fields = (
            "id",
            "contact",
            "contact_name",
            "title",
            "due_at",
            "status",
            "notes",
            "created_by",
            "completed_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "contact_name",
            "created_by",
            "completed_at",
            "created_at",
            "updated_at",
        )


class CadenceStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = CadenceStep
        fields = (
            "id",
            "cadence",
            "offset_days",
            "subject",
            "body",
            "order",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class CadenceSerializer(serializers.ModelSerializer):
    steps = CadenceStepSerializer(many=True, required=False)

    class Meta:
        model = Cadence
        fields = (
            "id",
            "name",
            "description",
            "is_active",
            "is_archived",
            "steps",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def create(self, validated_data):
        steps_data = validated_data.pop("steps", [])
        request = self.context["request"]
        cadence = Cadence.objects.create(tenant=request.tenant, **validated_data)
        for idx, step in enumerate(steps_data):
            CadenceStep.objects.create(
                tenant=request.tenant,
                cadence=cadence,
                order=step.get("order", idx + 1),
                offset_days=step["offset_days"],
                subject=step["subject"],
                body=step["body"],
            )
        return cadence

    def update(self, instance, validated_data):
        steps_data = validated_data.pop("steps", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if steps_data is not None:
            instance.steps.all().delete()
            request = self.context["request"]
            for idx, step in enumerate(steps_data):
                CadenceStep.objects.create(
                    tenant=request.tenant,
                    cadence=instance,
                    order=step.get("order", idx + 1),
                    offset_days=step["offset_days"],
                    subject=step["subject"],
                    body=step["body"],
                )
        return instance


class CadenceEnrollmentSerializer(serializers.ModelSerializer):
    contact_name = serializers.CharField(source="contact.full_name", read_only=True)
    cadence_name = serializers.CharField(source="cadence.name", read_only=True)

    class Meta:
        model = CadenceEnrollment
        fields = (
            "id",
            "cadence",
            "cadence_name",
            "contact",
            "contact_name",
            "status",
            "current_step_order",
            "next_run_at",
            "enrolled_at",
            "completed_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "contact_name",
            "cadence_name",
            "current_step_order",
            "enrolled_at",
            "completed_at",
            "created_at",
            "updated_at",
        )
