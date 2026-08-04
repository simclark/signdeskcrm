import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from .managers import UserManager

PASSWORD_RESET_EXPIRY_HOURS = 24


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(default=timezone.now)
    # Platform console RBAC (only meaningful when is_staff=True)
    platform_role = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="viewer | support | operator | admin (staff only)",
    )

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        ordering = ["email"]

    def __str__(self) -> str:
        return self.email

    @property
    def full_name(self) -> str:
        name = f"{self.first_name} {self.last_name}".strip()
        return name or self.email


class PasswordResetToken(models.Model):
    """One-time token for self-serve or admin-triggered password reset."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="password_reset_tokens",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="password_reset_tokens",
        null=True,
        blank=True,
        help_text="Workspace for tenant resets; null for platform staff resets.",
    )
    token = models.CharField(max_length=64, unique=True, blank=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        scope = self.tenant_id if self.tenant_id is not None else "platform"
        return f"Password reset for {self.user_id} @ {scope}"

    @property
    def is_platform(self) -> bool:
        return self.tenant_id is None

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(32)
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(hours=PASSWORD_RESET_EXPIRY_HOURS)
        super().save(*args, **kwargs)

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def is_usable(self) -> bool:
        return self.used_at is None and not self.is_expired
