from rest_framework import serializers

from apps.audit.models import AuditEvent


class AuditEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditEvent
        fields = (
            "id",
            "event_type",
            "actor_email",
            "actor_name",
            "ip_address",
            "user_agent",
            "consent_version",
            "payload",
            "created_at",
            "recipient",
        )
        read_only_fields = fields
