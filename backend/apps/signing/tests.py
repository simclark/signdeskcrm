from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.tenants.models import Membership, Tenant


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class SignedDocumentDownloadTests(TestCase):
    def setUp(self):
        from apps.documents.models import Document, DocumentVersion
        from apps.envelopes.models import Envelope, Field, Recipient
        from apps.envelopes.services import complete_recipient_signing, send_envelope
        from reportlab.pdfgen import canvas
        import io

        self.client = APIClient()
        self.tenant = Tenant.objects.create(name="Acme", slug="acme")
        self.user = User.objects.create_user(email="owner@acme.test", password="password123")
        Membership.objects.create(tenant=self.tenant, user=self.user, role=Membership.Role.OWNER)

        buf = io.BytesIO()
        c = canvas.Canvas(buf)
        c.drawString(100, 700, "Test contract")
        c.showPage()
        c.save()
        pdf = SimpleUploadedFile("test.pdf", buf.getvalue(), content_type="application/pdf")

        self.document = Document.objects.create(
            tenant=self.tenant, title="NDA", original_filename="test.pdf", created_by=self.user
        )
        self.version = DocumentVersion(
            tenant=self.tenant, document=self.document, version_number=1, file=pdf
        )
        self.version.save()
        self.version.compute_hash()
        self.version.page_count = 1
        self.version.save()

        self.envelope = Envelope.objects.create(
            tenant=self.tenant,
            title="NDA",
            document=self.document,
            document_version=self.version,
            created_by=self.user,
        )
        self.signer = Recipient.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            name="Signer",
            email="signer@example.com",
            routing_order=1,
        )
        self.cc = Recipient.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            name="Copy",
            email="cc@example.com",
            role=Recipient.Role.CC,
            routing_order=1,
        )
        self.field = Field.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            recipient=self.signer,
            field_type=Field.FieldType.SIGNATURE,
            page=1,
            x=0.1,
            y=0.1,
            w=0.3,
            h=0.05,
        )
        self.send_envelope = send_envelope
        self.complete_recipient_signing = complete_recipient_signing

    def _complete_envelope(self):
        from django.utils import timezone as dj_tz

        self.send_envelope(self.envelope)
        self.field.value = "Signer"
        self.field.completed_at = dj_tz.now()
        self.field.save()
        self.complete_recipient_signing(self.signer)
        self.envelope.refresh_from_db()
        self.signer.refresh_from_db()

    def test_guest_can_download_signed_pdf_without_auth(self):
        self._complete_envelope()
        self.assertEqual(self.envelope.status, "completed")

        res = self.client.get(f"/api/sign/{self.signer.access_token}/download/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "application/pdf")
        self.assertIn("attachment", res["Content-Disposition"])
        self.assertTrue(self.envelope.audit_events.filter(event_type="downloaded").exists())

    def test_cc_recipient_can_download_without_auth(self):
        self._complete_envelope()
        res = self.client.get(
            f"/api/sign/{self.cc.access_token}/download/?kind=signed"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "application/pdf")

    def test_session_exposes_download_urls_when_completed(self):
        self._complete_envelope()
        res = self.client.get(f"/api/sign/{self.signer.access_token}/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["downloads_ready"])
        self.assertIn("/download/?kind=signed", res.data["signed_download_url"])
        self.assertIn("/download/?kind=certificate", res.data["certificate_download_url"])

    def test_download_unavailable_before_completion(self):
        self.send_envelope(self.envelope)
        res = self.client.get(f"/api/sign/{self.signer.access_token}/download/")
        self.assertEqual(res.status_code, 409)

    def test_completion_email_includes_download_link(self):
        self._complete_envelope()
        completion_mails = [
            m for m in mail.outbox if m.subject.startswith("Completed:")
        ]
        self.assertGreaterEqual(len(completion_mails), 2)
        for message in completion_mails:
            self.assertIn("Download your signed copy", message.body)
            self.assertIn("/sign/", message.body)
            self.assertIn("no sign-in required", message.body.lower())
