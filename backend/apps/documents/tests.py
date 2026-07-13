import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from reportlab.pdfgen import canvas
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.documents.models import Document, DocumentVersion, Template
from apps.envelopes.models import Envelope
from apps.tenants.models import Membership, Tenant


def _pdf_bytes():
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(100, 700, "Test contract")
    c.showPage()
    c.save()
    return buf.getvalue()


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class DocumentLibraryApiTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Acme", slug="acme-docs")
        self.user = User.objects.create_user(email="owner@acme-docs.test", password="password123")
        Membership.objects.create(tenant=self.tenant, user=self.user, role=Membership.Role.OWNER)

        self.client = APIClient()
        self.client.force_authenticate(self.user)

        self.document = Document.objects.create(
            tenant=self.tenant,
            title="Service Agreement",
            original_filename="sa.pdf",
            created_by=self.user,
        )
        pdf = SimpleUploadedFile("sa.pdf", _pdf_bytes(), content_type="application/pdf")
        DocumentVersion.objects.create(
            tenant=self.tenant, document=self.document, version_number=1, file=pdf
        )

    def _kw(self):
        return {"HTTP_HOST": "acme-docs.signdeskcrm.test", "HTTP_X_TENANT_SLUG": "acme-docs"}

    def test_list_includes_usage_counts(self):
        Template.objects.create(
            tenant=self.tenant,
            name="SA Template",
            document=self.document,
            created_by=self.user,
        )
        Envelope.objects.create(
            tenant=self.tenant,
            title="SA Envelope",
            document=self.document,
            created_by=self.user,
        )

        res = self.client.get("/api/documents/", **self._kw())
        self.assertEqual(res.status_code, 200)
        row = next(r for r in res.data["results"] if r["id"] == self.document.id)
        self.assertEqual(row["template_count"], 1)
        self.assertEqual(row["envelope_count"], 1)

    def test_delete_blocked_when_in_use(self):
        Template.objects.create(
            tenant=self.tenant,
            name="SA Template",
            document=self.document,
            created_by=self.user,
        )
        res = self.client.delete(f"/api/documents/{self.document.id}/", **self._kw())
        self.assertEqual(res.status_code, 409)
        self.assertIn("cannot be deleted", res.data["detail"])
        self.assertTrue(Document.objects.filter(pk=self.document.id).exists())

    def test_delete_unused_document(self):
        res = self.client.delete(f"/api/documents/{self.document.id}/", **self._kw())
        self.assertEqual(res.status_code, 204)
        self.assertFalse(Document.objects.filter(pk=self.document.id).exists())

    def test_rename_document(self):
        res = self.client.patch(
            f"/api/documents/{self.document.id}/",
            {"title": "Renamed Agreement"},
            format="json",
            **self._kw(),
        )
        self.assertEqual(res.status_code, 200)
        self.document.refresh_from_db()
        self.assertEqual(self.document.title, "Renamed Agreement")
