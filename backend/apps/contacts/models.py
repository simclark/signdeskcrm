from django.conf import settings
from django.db import models

from apps.tenants.models_base import TenantOwnedModel


class Company(TenantOwnedModel):
    name = models.CharField(max_length=255)
    website = models.URLField(blank=True)
    notes = models.TextField(blank=True)
    is_archived = models.BooleanField(default=False)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "companies"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "name"],
                name="uniq_company_name_per_tenant",
            )
        ]

    def __str__(self) -> str:
        return self.name


class Contact(TenantOwnedModel):
    class Stage(models.TextChoices):
        LEAD = "lead", "Lead"
        NURTURE = "nurture", "Nurture"
        ACTIVE = "active", "Active"
        UNDER_CONTRACT = "under_contract", "Under contract"
        CLOSED = "closed", "Closed"
        INACTIVE = "inactive", "Inactive"

    company = models.ForeignKey(
        Company,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contacts",
    )
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150, blank=True)
    email = models.EmailField()
    phone = models.CharField(max_length=50, blank=True)
    title = models.CharField(max_length=150, blank=True)
    notes = models.TextField(blank=True)
    stage = models.CharField(
        max_length=32, choices=Stage.choices, default=Stage.LEAD, blank=True
    )
    tags = models.JSONField(default=list, blank=True)
    next_follow_up_at = models.DateTimeField(null=True, blank=True)
    is_archived = models.BooleanField(default=False)

    class Meta:
        ordering = ["last_name", "first_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "email"],
                name="uniq_contact_email_per_tenant",
            )
        ]

    def __str__(self) -> str:
        return self.full_name

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


class Listing(TenantOwnedModel):
    """Generic property / listing record for merge prefill (MLS CSV is one source)."""

    address = models.CharField(max_length=255)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=50, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    mls_number = models.CharField(max_length=64, blank=True, null=True)
    price = models.CharField(max_length=64, blank=True)
    beds = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    baths = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    sqft = models.PositiveIntegerField(null=True, blank=True)
    year_built = models.PositiveIntegerField(null=True, blank=True)
    description = models.TextField(blank=True)
    source = models.CharField(max_length=64, blank=True, default="manual")
    raw_data = models.JSONField(default=dict, blank=True)
    is_archived = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "mls_number"],
                name="uniq_listing_mls_per_tenant",
            )
        ]

    def __str__(self) -> str:
        return self.full_address or f"Listing {self.pk}"

    @property
    def full_address(self) -> str:
        parts = [self.address, self.city, self.state, self.postal_code]
        return ", ".join(p for p in parts if p)


class FollowUpTask(TenantOwnedModel):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        DONE = "done", "Done"
        CANCELLED = "cancelled", "Cancelled"

    contact = models.ForeignKey(
        Contact, on_delete=models.CASCADE, related_name="follow_up_tasks"
    )
    title = models.CharField(max_length=255)
    due_at = models.DateTimeField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="follow_up_tasks",
    )
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["due_at", "id"]

    def __str__(self) -> str:
        return f"{self.title} ({self.status})"


class Cadence(TenantOwnedModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    is_archived = models.BooleanField(default=False)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class CadenceStep(TenantOwnedModel):
    cadence = models.ForeignKey(Cadence, on_delete=models.CASCADE, related_name="steps")
    offset_days = models.PositiveIntegerField(
        help_text="Days after enrollment (or previous step) when this touch is due."
    )
    subject = models.CharField(max_length=255)
    body = models.TextField(
        help_text="Email body. Placeholders: {{contact_full_name}}, {{contact_first_name}}."
    )
    order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return f"{self.cadence_id}:{self.order} +{self.offset_days}d"


class CadenceEnrollment(TenantOwnedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    cadence = models.ForeignKey(
        Cadence, on_delete=models.CASCADE, related_name="enrollments"
    )
    contact = models.ForeignKey(
        Contact, on_delete=models.CASCADE, related_name="cadence_enrollments"
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE
    )
    current_step_order = models.PositiveIntegerField(default=1)
    next_run_at = models.DateTimeField(null=True, blank=True)
    enrolled_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-enrolled_at"]

    def __str__(self) -> str:
        return f"{self.contact_id} → {self.cadence_id} ({self.status})"


class Activity(TenantOwnedModel):
    class Kind(models.TextChoices):
        CREATED = "created", "Created"
        UPDATED = "updated", "Updated"
        ENVELOPE_SENT = "envelope_sent", "Envelope sent"
        ENVELOPE_SIGNED = "envelope_signed", "Envelope signed"
        ENVELOPE_COMPLETED = "envelope_completed", "Envelope completed"
        NOTE = "note", "Note"
        FOLLOW_UP = "follow_up", "Follow-up"
        CADENCE_EMAIL = "cadence_email", "Cadence email"

    contact = models.ForeignKey(
        Contact, on_delete=models.CASCADE, related_name="activities", null=True, blank=True
    )
    company = models.ForeignKey(
        Company, on_delete=models.CASCADE, related_name="activities", null=True, blank=True
    )
    kind = models.CharField(max_length=40, choices=Kind.choices)
    message = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "activities"
