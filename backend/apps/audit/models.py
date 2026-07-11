from django.db import models

from apps.tenants.models_base import TenantOwnedModel


class AuditEvent(TenantOwnedModel):
    """Append-only audit trail. Do not update or delete via application code."""

    class EventType(models.TextChoices):
        CREATED = "created", "Created"
        SENT = "sent", "Sent"
        VIEWED = "viewed", "Viewed"
        CONSENT_ACCEPTED = "consent_accepted", "Consent accepted"
        FIELD_COMPLETED = "field_completed", "Field completed"
        SIGNED = "signed", "Signed"
        DECLINED = "declined", "Declined"
        VOIDED = "voided", "Voided"
        COMPLETED = "completed", "Completed"
        REMINDED = "reminded", "Reminded"
        DOWNLOADED = "downloaded", "Downloaded"

    envelope = models.ForeignKey(
        "envelopes.Envelope",
        on_delete=models.CASCADE,
        related_name="audit_events",
    )
    recipient = models.ForeignKey(
        "envelopes.Recipient",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_events",
    )
    event_type = models.CharField(max_length=40, choices=EventType.choices)
    actor_email = models.EmailField(blank=True)
    actor_name = models.CharField(max_length=255, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    consent_version = models.CharField(max_length=32, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["envelope", "created_at"]),
        ]

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError("Audit events are immutable and cannot be updated.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Audit events cannot be deleted.")
