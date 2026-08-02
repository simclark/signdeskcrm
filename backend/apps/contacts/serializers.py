from rest_framework import serializers

from apps.contacts.models import (
    Activity,
    Company,
    Contact,
    FollowUpPlan,
    FollowUpPlanEnrollment,
    FollowUpPlanStep,
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

    def validate_website(self, value):
        value = (value or "").strip()
        if not value:
            return ""
        if not value.startswith(("http://", "https://")):
            value = f"https://{value}"
        return value


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


class FollowUpPlanStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = FollowUpPlanStep
        fields = (
            "id",
            "plan",
            "offset_days",
            "subject",
            "body",
            "order",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "plan", "created_at", "updated_at")


class FollowUpPlanSerializer(serializers.ModelSerializer):
    steps = FollowUpPlanStepSerializer(many=True, required=False)

    class Meta:
        model = FollowUpPlan
        fields = (
            "id",
            "name",
            "description",
            "trigger",
            "idle_hours",
            "create_agent_handoff",
            "handoff_title",
            "is_active",
            "is_archived",
            "steps",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def create(self, validated_data):
        steps_data = validated_data.pop("steps", [])
        plan = FollowUpPlan.objects.create(**validated_data)
        tenant = plan.tenant
        for idx, step in enumerate(steps_data):
            FollowUpPlanStep.objects.create(
                tenant=tenant,
                plan=plan,
                order=step.get("order", idx + 1),
                offset_days=step["offset_days"],
                subject=step["subject"],
                body=step["body"],
            )
        return plan

    def update(self, instance, validated_data):
        steps_data = validated_data.pop("steps", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if steps_data is not None:
            instance.steps.all().delete()
            for idx, step in enumerate(steps_data):
                FollowUpPlanStep.objects.create(
                    tenant=instance.tenant,
                    plan=instance,
                    order=step.get("order", idx + 1),
                    offset_days=step["offset_days"],
                    subject=step["subject"],
                    body=step["body"],
                )
        return instance


class FollowUpPlanEnrollmentSerializer(serializers.ModelSerializer):
    contact_name = serializers.CharField(source="contact.full_name", read_only=True)
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    recipient_name = serializers.CharField(source="recipient.name", read_only=True)
    envelope_title = serializers.CharField(source="envelope.title", read_only=True)

    class Meta:
        model = FollowUpPlanEnrollment
        fields = (
            "id",
            "plan",
            "plan_name",
            "envelope",
            "envelope_title",
            "recipient",
            "recipient_name",
            "contact",
            "contact_name",
            "status",
            "current_step_order",
            "next_run_at",
            "started_at",
            "emails_sent",
            "enrolled_at",
            "completed_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "plan_name",
            "envelope_title",
            "recipient_name",
            "contact_name",
            "current_step_order",
            "started_at",
            "emails_sent",
            "enrolled_at",
            "completed_at",
            "created_at",
            "updated_at",
        )
