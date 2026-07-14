import hashlib

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.tenants.models_base import TenantOwnedModel

# settings used for AUTH_USER_MODEL and upload limits


def validate_pdf(file_obj):
    name = getattr(file_obj, "name", "")
    if not name.lower().endswith(".pdf"):
        raise ValidationError("Only PDF files are allowed.")
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_obj.size > max_bytes:
        raise ValidationError(f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit.")


class Document(TenantOwnedModel):
    title = models.CharField(max_length=255)
    original_filename = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="documents",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title

    @property
    def current_version(self):
        return self.versions.order_by("-version_number").first()


class DocumentVersion(TenantOwnedModel):
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="versions")
    version_number = models.PositiveIntegerField(default=1)
    file = models.FileField(upload_to="documents/%Y/%m/", validators=[validate_pdf])
    page_count = models.PositiveIntegerField(default=1)
    sha256 = models.CharField(max_length=64, blank=True)
    byte_size = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-version_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["document", "version_number"],
                name="uniq_document_version",
            )
        ]

    def compute_hash(self):
        self.file.open("rb")
        digest = hashlib.sha256()
        for chunk in self.file.chunks():
            digest.update(chunk)
        self.file.close()
        self.sha256 = digest.hexdigest()
        self.byte_size = self.file.size
        return self.sha256


ALLOWED_TEMPLATE_FIELD_TYPES = frozenset(
    {"signature", "initials", "date", "text", "checkbox"}
)


class Template(TenantOwnedModel):
    name = models.CharField(max_length=255)
    document = models.ForeignKey(
        Document, on_delete=models.PROTECT, related_name="templates"
    )
    field_layout = models.JSONField(default=list, blank=True)
    # Named signer slots: [{key, label, order}] — horizontal; not industry-specific
    roles = models.JSONField(default=list, blank=True)
    category = models.CharField(max_length=64, blank=True, default="general")
    description = models.TextField(blank=True)
    is_library = models.BooleanField(
        default=False,
        help_text="Curated form-library entry (cloneable starting point).",
    )
    library_key = models.CharField(
        max_length=128,
        blank=True,
        null=True,
        help_text="Stable key for seeded library forms (null for user templates).",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="templates",
    )
    is_active = models.BooleanField(default=True)
    is_archived = models.BooleanField(default=False)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "library_key"],
                name="uniq_template_library_key_per_tenant",
            )
        ]

    def __str__(self) -> str:
        return self.name
