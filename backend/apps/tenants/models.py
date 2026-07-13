import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from apps.tenants.email_templates import DEFAULT_TEMPLATES, EmailTemplateKey
from apps.tenants.esign_disclosure import (
    DEFAULT_ESIGN_ACKNOWLEDGEMENT,
    DEFAULT_ESIGN_ACKNOWLEDGEMENT_VERSION,
)
from apps.tenants.models_base import TenantOwnedModel, TimeStampedModel

INVITE_EXPIRY_DAYS = 7

RESERVED_SLUGS = frozenset(
    {
        "www",
        "api",
        "app",
        "mail",
        "admin",
        "static",
        "media",
        "support",
        "help",
        "status",
        "docs",
        "billing",
        "signup",
        "login",
        "auth",
        "cdn",
        "assets",
    }
)

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def validate_tenant_slug(value: str) -> None:
    if value in RESERVED_SLUGS:
        raise ValidationError("This subdomain is reserved.")
    if not SLUG_RE.match(value):
        raise ValidationError(
            "Slug must be lowercase letters, numbers, and hyphens only."
        )
    if len(value) < 2 or len(value) > 63:
        raise ValidationError("Slug must be between 2 and 63 characters.")


class Tenant(TimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"

    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=63, unique=True, validators=[validate_tenant_slug])
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE
    )
    logo = models.ImageField(upload_to="tenant_logos/", blank=True, null=True)
    icon = models.ImageField(upload_to="tenant_icons/", blank=True, null=True)
    accent_color = models.CharField(max_length=7, default="#0B6E4F")
    timezone = models.CharField(max_length=64, default="UTC")
    default_expiration_days = models.PositiveIntegerField(default=14)
    esign_acknowledgement = models.TextField(default=DEFAULT_ESIGN_ACKNOWLEDGEMENT)
    esign_acknowledgement_version = models.CharField(
        max_length=32, default=DEFAULT_ESIGN_ACKNOWLEDGEMENT_VERSION
    )

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.slug})"

    def clean(self):
        super().clean()
        self.slug = slugify(self.slug)
        validate_tenant_slug(self.slug)

    def host(self) -> str:
        base = settings.BASE_DOMAIN
        port = settings.FRONTEND_PORT
        # Local/dev hosts need an explicit frontend port in URLs.
        if base in ("localhost", "127.0.0.1") or base.endswith(".test"):
            return f"{self.slug}.{base}:{port}"
        return f"{self.slug}.{base}"

    def frontend_url(self, path: str = "/") -> str:
        proto = settings.FRONTEND_PROTOCOL
        return f"{proto}://{self.host()}{path}"


class Membership(TimeStampedModel):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        ADMIN = "admin", "Admin"
        MEMBER = "member", "Member"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.MEMBER)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "user"], name="uniq_membership_tenant_user"
            )
        ]
        ordering = ["tenant_id", "user_id"]

    def __str__(self) -> str:
        return f"{self.user} @ {self.tenant.slug} ({self.role})"


class Invitation(TimeStampedModel):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        MEMBER = "member", "Member"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="invitations")
    email = models.EmailField()
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.MEMBER)
    token = models.CharField(max_length=64, unique=True, blank=True)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sent_invitations",
    )
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Invite {self.email} → {self.tenant.slug} ({self.role})"

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(32)
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(days=INVITE_EXPIRY_DAYS)
        self.email = self.email.lower().strip()
        super().save(*args, **kwargs)

    @property
    def is_pending(self) -> bool:
        return self.accepted_at is None and self.revoked_at is None

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def is_usable(self) -> bool:
        return self.is_pending and not self.is_expired


class EmailTemplate(TenantOwnedModel):
    key = models.CharField(max_length=64, choices=EmailTemplateKey.CHOICES)
    subject = models.CharField(max_length=255)
    body = models.TextField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "key"], name="uniq_email_template_tenant_key"
            )
        ]
        ordering = ["tenant_id", "key"]

    def __str__(self) -> str:
        return f"{self.tenant.slug}:{self.key}"


def ensure_email_templates(tenant: Tenant) -> list[EmailTemplate]:
    """Create any missing email templates for a tenant from platform defaults."""
    existing = {
        row.key: row
        for row in EmailTemplate.objects.filter(tenant=tenant, key__in=EmailTemplateKey.ALL)
    }
    created: list[EmailTemplate] = []
    for key in EmailTemplateKey.ALL:
        if key in existing:
            continue
        default = DEFAULT_TEMPLATES[key]
        created.append(
            EmailTemplate.objects.create(
                tenant=tenant,
                key=key,
                subject=default["subject"],
                body=default["body"],
            )
        )
    return list(existing.values()) + created
