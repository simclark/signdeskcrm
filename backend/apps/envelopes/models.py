import secrets
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.common.upload_paths import (
    certificate_upload_to,
    signature_upload_to,
    signed_upload_to,
)
from apps.tenants.models_base import TenantOwnedModel


class Envelope(TenantOwnedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"
        VOIDED = "voided", "Voided"
        DECLINED = "declined", "Declined"
        EXPIRED = "expired", "Expired"

    class Routing(models.TextChoices):
        SEQUENTIAL = "sequential", "Sequential"
        PARALLEL = "parallel", "Parallel"

    title = models.CharField(max_length=255)
    message = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    routing = models.CharField(
        max_length=20, choices=Routing.choices, default=Routing.SEQUENTIAL
    )
    document = models.ForeignKey(
        "documents.Document",
        on_delete=models.PROTECT,
        related_name="envelopes",
    )
    document_version = models.ForeignKey(
        "documents.DocumentVersion",
        on_delete=models.PROTECT,
        related_name="envelopes",
        null=True,
        blank=True,
    )
    template = models.ForeignKey(
        "documents.Template",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="envelopes",
    )
    listing = models.ForeignKey(
        "contacts.Listing",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="envelopes",
    )
    follow_up_plan = models.ForeignKey(
        "contacts.FollowUpPlan",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="envelopes",
    )
    # Freeform deal overrides for merge tokens (e.g. {"price": "450000", "closing_date": "..."})
    merge_data = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="envelopes",
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True)
    signed_file = models.FileField(
        upload_to=signed_upload_to, blank=True, null=True
    )
    certificate_file = models.FileField(
        upload_to=certificate_upload_to, blank=True, null=True
    )
    pre_sign_sha256 = models.CharField(max_length=64, blank=True)
    post_sign_sha256 = models.CharField(max_length=64, blank=True)
    retention_purged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.title} ({self.status})"


class Recipient(TenantOwnedModel):
    class Role(models.TextChoices):
        SIGNER = "signer", "Signer"
        CC = "cc", "CC"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SENT = "sent", "Sent"
        VIEWED = "viewed", "Viewed"
        SIGNED = "signed", "Signed"
        NOT_REQUIRED = "not_required", "Not required"
        DECLINED = "declined", "Declined"

    envelope = models.ForeignKey(Envelope, on_delete=models.CASCADE, related_name="recipients")
    contact = models.ForeignKey(
        "contacts.Contact",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="envelope_recipients",
    )
    name = models.CharField(max_length=255)
    email = models.EmailField()
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.SIGNER)
    # Named slot from template roles (buyer / seller / agent / custom)
    role_key = models.CharField(max_length=64, blank=True)
    routing_order = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    access_token = models.CharField(max_length=64, unique=True, blank=True)
    decline_reason = models.TextField(blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    viewed_at = models.DateTimeField(null=True, blank=True)
    signed_at = models.DateTimeField(null=True, blank=True)
    last_reminded_at = models.DateTimeField(null=True, blank=True)
    reminder_count = models.PositiveIntegerField(default=0)
    # Immutable ESIGN/UETA consent snapshot (set once on accept)
    consented_at = models.DateTimeField(null=True, blank=True)
    consent_version = models.CharField(max_length=32, blank=True)
    consent_text = models.TextField(blank=True)
    consent_text_sha256 = models.CharField(max_length=64, blank=True)
    consent_ip = models.GenericIPAddressField(null=True, blank=True)
    consent_user_agent = models.TextField(blank=True)

    class Meta:
        ordering = ["routing_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["envelope", "email"],
                name="uniq_recipient_email_per_envelope",
            )
        ]

    def save(self, *args, **kwargs):
        if not self.access_token:
            self.access_token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.name} <{self.email}>"


class Field(TenantOwnedModel):
    class FieldType(models.TextChoices):
        SIGNATURE = "signature", "Signature"
        INITIALS = "initials", "Initials"
        DATE = "date", "Date"
        TEXT = "text", "Text"
        CHECKBOX = "checkbox", "Checkbox"

    class FillMode(models.TextChoices):
        SIGNER = "signer", "Signer completes"
        DOCUMENT = "document", "Document data (stamped on send)"

    envelope = models.ForeignKey(Envelope, on_delete=models.CASCADE, related_name="fields")
    # Null when fill_mode=document (shared stamp data, not a signer task).
    recipient = models.ForeignKey(
        Recipient,
        on_delete=models.CASCADE,
        related_name="fields",
        null=True,
        blank=True,
    )
    field_type = models.CharField(max_length=20, choices=FieldType.choices)
    page = models.PositiveIntegerField(default=1)
    # Normalized PDF coordinates 0-1, origin bottom-left
    x = models.FloatField()
    y = models.FloatField()
    w = models.FloatField()
    h = models.FloatField()
    required = models.BooleanField(default=True)
    label = models.CharField(max_length=255, blank=True)
    merge_token = models.CharField(max_length=128, blank=True)
    # document = filled at prepare, stamped into PDF on send; signer = completed in-session
    fill_mode = models.CharField(
        max_length=20,
        choices=FillMode.choices,
        default=FillMode.SIGNER,
    )
    value = models.TextField(blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["page", "id"]

    def __str__(self) -> str:
        return f"{self.field_type} p{self.page}"


class SignatureAsset(TenantOwnedModel):
    recipient = models.ForeignKey(
        Recipient, on_delete=models.CASCADE, related_name="signature_assets"
    )
    kind = models.CharField(max_length=20, default="signature")  # signature | initials
    image = models.ImageField(upload_to=signature_upload_to)
    created_at = models.DateTimeField(auto_now_add=True)
