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
            self.assertIn("Download your signed", message.body)
            self.assertIn("/sign/", message.body)
            self.assertIn("no sign-in required", message.body.lower())
            self.assertIn("Certificate of Completion", message.body)


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class EsignConsentComplianceTests(TestCase):
    def setUp(self):
        from apps.documents.models import Document, DocumentVersion
        from apps.envelopes.models import Envelope, Field, Recipient
        from apps.envelopes.services import send_envelope
        from reportlab.pdfgen import canvas
        import io

        self.client = APIClient()
        self.tenant = Tenant.objects.create(name="Acme", slug="acme-consent")
        self.user = User.objects.create_user(email="owner@acme-consent.test", password="password123")
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
            required=True,
        )
        send_envelope(self.envelope)
        self.token = self.signer.access_token

    def test_session_exposes_full_disclosure_and_has_consented_false(self):
        res = self.client.get(f"/api/sign/{self.token}/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["has_consented"])
        self.assertIn("E-SIGN Act", res.data["consent_text"])
        self.assertIn("UETA", res.data["consent_text"])
        self.assertIn("Hardware and software", res.data["consent_text"])

    def test_field_complete_and_submit_require_consent(self):
        res = self.client.post(
            f"/api/sign/{self.token}/fields/{self.field.id}/",
            {"value": "Signer"},
            format="json",
        )
        self.assertEqual(res.status_code, 403)

        res = self.client.post(f"/api/sign/{self.token}/submit/", {}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_consent_snapshots_text_and_survives_tenant_edit(self):
        from apps.tenants.esign_disclosure import resolve_acknowledgement, sha256_text

        text, _version = resolve_acknowledgement(self.tenant)
        res = self.client.post(f"/api/sign/{self.token}/consent/", {}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["has_consented"])
        self.assertEqual(res.data["consent_text_sha256"], sha256_text(text))

        self.signer.refresh_from_db()
        self.assertIsNotNone(self.signer.consented_at)
        self.assertEqual(self.signer.consent_text, text)
        snapshot_hash = self.signer.consent_text_sha256

        self.tenant.esign_acknowledgement = "Completely different disclosure text."
        self.tenant.esign_acknowledgement_version = "changed"
        self.tenant.save()

        self.signer.refresh_from_db()
        self.assertEqual(self.signer.consent_text, text)
        self.assertEqual(self.signer.consent_text_sha256, snapshot_hash)

        session = self.client.get(f"/api/sign/{self.token}/")
        self.assertTrue(session.data["has_consented"])
        self.assertEqual(session.data["consent_text"], text)

    def test_signing_succeeds_after_consent(self):
        self.client.post(f"/api/sign/{self.token}/consent/", {}, format="json")
        res = self.client.post(
            f"/api/sign/{self.token}/fields/{self.field.id}/",
            {"value": "Signer"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        res = self.client.post(f"/api/sign/{self.token}/submit/", {}, format="json")
        self.assertEqual(res.status_code, 200)
        self.signer.refresh_from_db()
        self.assertEqual(self.signer.status, "signed")

    def test_certificate_includes_esign_and_consent_hash(self):
        import io

        from django.utils import timezone as dj_tz
        from pypdf import PdfReader

        from apps.envelopes.services import (
            accept_consent,
            complete_recipient_signing,
            generate_certificate_pdf,
        )

        class FakeRequest:
            META = {"REMOTE_ADDR": "203.0.113.10", "HTTP_USER_AGENT": "TestAgent/1.0"}

        accept_consent(self.signer, FakeRequest())
        self.field.value = "Signer"
        self.field.completed_at = dj_tz.now()
        self.field.save()
        complete_recipient_signing(self.signer, FakeRequest())
        self.envelope.refresh_from_db()
        self.signer.refresh_from_db()

        cert = generate_certificate_pdf(self.envelope)
        reader = PdfReader(io.BytesIO(cert))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        self.assertIn("E-SIGN Act", text)
        self.assertIn("UETA", text)
        self.assertIn(self.signer.consent_text_sha256[:16], text)
        self.assertIn("Disclosure SHA-256", text)

    def test_restore_default_acknowledgement(self):
        from apps.tenants.esign_disclosure import DEFAULT_ESIGN_ACKNOWLEDGEMENT
        from rest_framework_simplejwt.tokens import RefreshToken

        self.tenant.esign_acknowledgement = "Custom workspace disclosure"
        self.tenant.esign_acknowledgement_version = "custom"
        self.tenant.save()

        token = str(RefreshToken.for_user(self.user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        res = self.client.post(
            "/api/tenant/settings/restore-esign-acknowledgement/",
            HTTP_HOST="acme-consent.localhost",
            HTTP_X_TENANT_SLUG="acme-consent",
        )
        self.assertEqual(res.status_code, 200)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.esign_acknowledgement, DEFAULT_ESIGN_ACKNOWLEDGEMENT)
        self.assertNotEqual(self.tenant.esign_acknowledgement_version, "custom")

    def test_migration_leaves_custom_text(self):
        import importlib.util
        from pathlib import Path

        from apps.tenants.esign_disclosure import (
            DEFAULT_ESIGN_ACKNOWLEDGEMENT,
            LEGACY_ESIGN_ACKNOWLEDGEMENT,
        )

        custom = Tenant.objects.create(
            name="Custom Co",
            slug="custom-co",
            esign_acknowledgement="Our special legal text",
            esign_acknowledgement_version="keep-me",
        )
        legacy = Tenant.objects.create(
            name="Legacy Co",
            slug="legacy-co",
            esign_acknowledgement=LEGACY_ESIGN_ACKNOWLEDGEMENT,
            esign_acknowledgement_version="2026-01",
        )

        migration_path = (
            Path(__file__).resolve().parents[1]
            / "tenants"
            / "migrations"
            / "0004_esign_ueta_consent.py"
        )
        spec = importlib.util.spec_from_file_location(
            "esign_ueta_consent_migration", migration_path
        )
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)

        from django.apps import apps

        module.upgrade_legacy_acknowledgements(apps, None)
        custom.refresh_from_db()
        legacy.refresh_from_db()
        self.assertEqual(custom.esign_acknowledgement, "Our special legal text")
        self.assertEqual(custom.esign_acknowledgement_version, "keep-me")
        self.assertEqual(legacy.esign_acknowledgement, DEFAULT_ESIGN_ACKNOWLEDGEMENT)
