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


class Activity(TenantOwnedModel):
    class Kind(models.TextChoices):
        CREATED = "created", "Created"
        UPDATED = "updated", "Updated"
        ENVELOPE_SENT = "envelope_sent", "Envelope sent"
        ENVELOPE_SIGNED = "envelope_signed", "Envelope signed"
        ENVELOPE_COMPLETED = "envelope_completed", "Envelope completed"
        NOTE = "note", "Note"

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
