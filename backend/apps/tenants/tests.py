from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.contacts.models import Contact
from apps.tenants.models import Membership, Tenant


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class TenantIsolationTests(TestCase):
    def setUp(self):
        self.client_a = APIClient()
        self.client_b = APIClient()

        self.tenant_a = Tenant.objects.create(name="Acme", slug="acme-esign")
        self.tenant_b = Tenant.objects.create(name="Globex", slug="globex")

        self.user_a = User.objects.create_user(email="a@acme.test", password="password123")
        self.user_b = User.objects.create_user(email="b@globex.test", password="password123")

        Membership.objects.create(
            tenant=self.tenant_a, user=self.user_a, role=Membership.Role.OWNER
        )
        Membership.objects.create(
            tenant=self.tenant_b, user=self.user_b, role=Membership.Role.OWNER
        )

        Contact.objects.create(
            tenant=self.tenant_a,
            first_name="Alice",
            last_name="A",
            email="alice@acme.test",
        )
        Contact.objects.create(
            tenant=self.tenant_b,
            first_name="Bob",
            last_name="B",
            email="bob@globex.test",
        )

        self.client_a.force_authenticate(self.user_a)
        self.client_b.force_authenticate(self.user_b)

    def test_contacts_are_tenant_scoped(self):
        res_a = self.client_a.get(
            "/api/contacts/", HTTP_HOST="acme-esign.localhost", HTTP_X_TENANT_SLUG="acme-esign"
        )
        res_b = self.client_b.get(
            "/api/contacts/", HTTP_HOST="globex.localhost", HTTP_X_TENANT_SLUG="globex"
        )
        self.assertEqual(res_a.status_code, 200)
        self.assertEqual(res_b.status_code, 200)
        emails_a = {c["email"] for c in res_a.data["results"]}
        emails_b = {c["email"] for c in res_b.data["results"]}
        self.assertEqual(emails_a, {"alice@acme.test"})
        self.assertEqual(emails_b, {"bob@globex.test"})

    def test_cross_tenant_member_denied(self):
        res = self.client_a.get(
            "/api/contacts/", HTTP_HOST="globex.localhost", HTTP_X_TENANT_SLUG="globex"
        )
        self.assertEqual(res.status_code, 403)


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class SignupTests(TestCase):
    def test_signup_creates_tenant_and_owner(self):
        client = APIClient()
        res = client.post(
            "/api/auth/signup/",
            {
                "company_name": "Acme Esign, Inc",
                "slug": "acme-esign",
                "email": "owner@acme.test",
                "password": "password123",
                "first_name": "Pat",
                "last_name": "Owner",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertTrue(Tenant.objects.filter(slug="acme-esign").exists())
        self.assertEqual(res.data["redirect_host"].startswith("acme-esign."), True)


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class EnvelopeStateTests(TestCase):
    def setUp(self):
        from apps.documents.models import Document, DocumentVersion
        from apps.envelopes.models import Envelope, Field, Recipient
        from apps.envelopes.services import send_envelope, complete_recipient_signing
        from reportlab.pdfgen import canvas
        import io

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
        self.recipient = Recipient.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            name="Signer",
            email="signer@example.com",
            routing_order=1,
        )
        self.field = Field.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            recipient=self.recipient,
            field_type=Field.FieldType.SIGNATURE,
            page=1,
            x=0.1,
            y=0.1,
            w=0.3,
            h=0.05,
        )
        self.send_envelope = send_envelope
        self.complete_recipient_signing = complete_recipient_signing

    def test_send_and_sign_completes(self):
        from apps.envelopes.models import Envelope, Recipient

        self.send_envelope(self.envelope)
        self.envelope.refresh_from_db()
        self.assertEqual(self.envelope.status, Envelope.Status.SENT)

        self.field.value = "Signer"
        from django.utils import timezone as dj_tz

        self.field.completed_at = dj_tz.now()
        self.field.save()

        self.complete_recipient_signing(self.recipient)
        self.envelope.refresh_from_db()
        self.recipient.refresh_from_db()
        self.assertEqual(self.recipient.status, Recipient.Status.SIGNED)
        self.assertEqual(self.envelope.status, Envelope.Status.COMPLETED)
        self.assertTrue(self.envelope.signed_file)
        self.assertTrue(self.envelope.certificate_file)
        self.assertTrue(self.envelope.audit_events.filter(event_type="completed").exists())
