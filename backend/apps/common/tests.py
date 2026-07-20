from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.documents.models import Document, DocumentVersion
from apps.tenants.models import Membership, Tenant


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class ProtectedMediaTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Acme", slug="acme-media")
        self.user = User.objects.create_user(email="owner@acme-media.test", password="password123")
        Membership.objects.create(tenant=self.tenant, user=self.user, role=Membership.Role.OWNER)
        self.other = Tenant.objects.create(name="Other", slug="other-media")
        self.other_user = User.objects.create_user(
            email="owner@other-media.test", password="password123"
        )
        Membership.objects.create(
            tenant=self.other, user=self.other_user, role=Membership.Role.OWNER
        )

        self.document = Document.objects.create(
            tenant=self.tenant,
            title="Secret",
            original_filename="secret.pdf",
            created_by=self.user,
        )
        self.version = DocumentVersion(
            tenant=self.tenant,
            document=self.document,
            version_number=1,
            file=ContentFile(b"%PDF-1.4 secret", name="secret.pdf"),
        )
        self.version.save()

        self.client = APIClient()
        self.host = {
            "HTTP_HOST": f"{self.tenant.slug}.signdeskcrm.test",
            "HTTP_X_TENANT_SLUG": self.tenant.slug,
        }

    def test_anonymous_cannot_fetch_document_media(self):
        path = f"/api/media/{self.version.file.name}"
        res = self.client.get(path, **self.host)
        self.assertEqual(res.status_code, 401)

    def test_member_can_fetch_own_document_media(self):
        self.client.force_authenticate(self.user)
        path = f"/api/media/{self.version.file.name}"
        res = self.client.get(path, **self.host)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(b"".join(res.streaming_content), b"%PDF-1.4 secret")

    def test_other_tenant_member_cannot_fetch(self):
        self.client.force_authenticate(self.other_user)
        path = f"/api/media/{self.version.file.name}"
        res = self.client.get(
            path,
            HTTP_HOST=f"{self.other.slug}.signdeskcrm.test",
            HTTP_X_TENANT_SLUG=self.other.slug,
        )
        self.assertEqual(res.status_code, 404)
