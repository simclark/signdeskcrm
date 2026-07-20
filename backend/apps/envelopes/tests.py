import io

from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from datetime import timedelta
from pypdf import PdfReader
from reportlab.pdfgen import canvas

from apps.accounts.models import User
from apps.documents.models import Document, DocumentVersion
from apps.envelopes.models import Envelope, Field, Recipient
from apps.envelopes.services import flatten_envelope_pdf, next_copy_title
from apps.tenants.models import Membership, Tenant


def _multi_page_pdf(pages: int = 2) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    for i in range(pages):
        c.drawString(72, 720, f"Contract page {i + 1}")
        c.showPage()
    c.save()
    return buf.getvalue()


class FlattenFieldTypesTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Acme", slug="acme-flatten")
        self.user = User.objects.create_user(email="owner@acme-flatten.test", password="password123")
        Membership.objects.create(tenant=self.tenant, user=self.user, role=Membership.Role.OWNER)

        pdf = SimpleUploadedFile(
            "multi.pdf", _multi_page_pdf(2), content_type="application/pdf"
        )
        self.document = Document.objects.create(
            tenant=self.tenant,
            title="Multi-page NDA",
            original_filename="multi.pdf",
            created_by=self.user,
        )
        self.version = DocumentVersion(
            tenant=self.tenant, document=self.document, version_number=1, file=pdf
        )
        self.version.save()
        self.version.compute_hash()
        self.version.page_count = 2
        self.version.save()

        self.envelope = Envelope.objects.create(
            tenant=self.tenant,
            title="Multi-page NDA",
            document=self.document,
            document_version=self.version,
            created_by=self.user,
            status=Envelope.Status.SENT,
            sent_at=timezone.now(),
        )
        self.recipient = Recipient.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            name="Alex Signer",
            email="alex@example.com",
            routing_order=1,
            status=Recipient.Status.SIGNED,
            signed_at=timezone.now(),
        )

    def _add_field(self, field_type, page, x, y, w, h, value):
        field = Field.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            recipient=self.recipient,
            field_type=field_type,
            page=page,
            x=x,
            y=y,
            w=w,
            h=h,
            required=True,
            label=field_type.title(),
            value=value,
            completed_at=timezone.now(),
        )
        return field

    def test_flatten_all_field_types_across_pages(self):
        self._add_field(Field.FieldType.SIGNATURE, 1, 0.1, 0.1, 0.28, 0.06, "Alex Signer")
        self._add_field(Field.FieldType.INITIALS, 1, 0.5, 0.1, 0.12, 0.05, "AS")
        self._add_field(Field.FieldType.DATE, 1, 0.1, 0.2, 0.18, 0.04, "2026-07-11")
        self._add_field(Field.FieldType.TEXT, 2, 0.1, 0.75, 0.4, 0.04, "Title: Director")
        self._add_field(Field.FieldType.CHECKBOX, 2, 0.1, 0.65, 0.03, 0.03, "true")
        # Near page edge after "resize-like" placement
        self._add_field(Field.FieldType.TEXT, 2, 0.7, 0.02, 0.28, 0.04, "Edge note")

        pdf_bytes = flatten_envelope_pdf(self.envelope)
        self.assertGreater(len(pdf_bytes), 500)

        reader = PdfReader(io.BytesIO(pdf_bytes))
        self.assertEqual(len(reader.pages), 2)

        page1_text = reader.pages[0].extract_text() or ""
        page2_text = reader.pages[1].extract_text() or ""
        self.assertIn("Alex Signer", page1_text)
        self.assertIn("AS", page1_text)
        self.assertIn("2026-07-11", page1_text)
        self.assertIn("Title: Director", page2_text)
        self.assertIn("Edge note", page2_text)
        self.assertIn("X", page2_text)

    def test_flatten_checkbox_unchecked_draws_box_without_x_marker_value(self):
        self._add_field(Field.FieldType.CHECKBOX, 1, 0.2, 0.3, 0.04, 0.04, "false")
        self._add_field(Field.FieldType.TEXT, 1, 0.3, 0.3, 0.3, 0.04, "Plain text only")

        pdf_bytes = flatten_envelope_pdf(self.envelope)
        reader = PdfReader(io.BytesIO(pdf_bytes))
        text = reader.pages[0].extract_text() or ""
        self.assertIn("Plain text only", text)

    def test_flatten_signature_image_path(self):
        # Minimal 1x1 PNG
        png = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
            b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        path = self.envelope.document_version.file.storage.save(
            "signatures/test-sig.png", ContentFile(png)
        )
        full_path = self.envelope.document_version.file.storage.path(path)
        self._add_field(Field.FieldType.SIGNATURE, 1, 0.15, 0.4, 0.3, 0.08, full_path)

        pdf_bytes = flatten_envelope_pdf(self.envelope)
        self.assertGreater(len(pdf_bytes), 500)
        reader = PdfReader(io.BytesIO(pdf_bytes))
        self.assertEqual(len(reader.pages), 2)


class NextCopyTitleTests(TestCase):
    def test_first_copy_appends_copy(self):
        self.assertEqual(next_copy_title("sample-service-agreement"), "sample-service-agreement (copy)")

    def test_copy_of_copy_uses_number(self):
        self.assertEqual(
            next_copy_title("sample-service-agreement (copy)"),
            "sample-service-agreement (copy 2)",
        )

    def test_increments_numbered_copy(self):
        self.assertEqual(
            next_copy_title("sample-service-agreement (copy 2)"),
            "sample-service-agreement (copy 3)",
        )

    def test_normalizes_stacked_copy_suffixes(self):
        self.assertEqual(
            next_copy_title("sample-service-agreement (copy) (copy)"),
            "sample-service-agreement (copy 3)",
        )


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class EsignPolicySettingsTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Policy Co",
            slug="policy-co",
            reminders_enabled=True,
            reminder_interval_hours=24,
            reminder_max_count=1,
            document_retention_days=30,
            accent_color="#1D4ED8",
            timezone="America/Chicago",
            sender_support_email="legal@policy.test",
        )
        self.user = User.objects.create_user(email="owner@policy.test", password="password123")
        Membership.objects.create(tenant=self.tenant, user=self.user, role=Membership.Role.OWNER)
        pdf = SimpleUploadedFile("doc.pdf", _multi_page_pdf(1), content_type="application/pdf")
        self.document = Document.objects.create(
            tenant=self.tenant, title="Doc", original_filename="doc.pdf", created_by=self.user
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
            title="Agreement",
            document=self.document,
            document_version=self.version,
            created_by=self.user,
            status=Envelope.Status.SENT,
            sent_at=timezone.now() - timedelta(days=3),
            expires_at=timezone.now() + timedelta(days=10),
        )
        self.recipient = Recipient.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            name="Signer",
            email="signer@policy.test",
            status=Recipient.Status.SENT,
            sent_at=timezone.now() - timedelta(days=3),
        )

    def test_reminders_respect_interval_and_max_count(self):
        from apps.envelopes.tasks import send_due_reminders

        send_due_reminders()
        self.recipient.refresh_from_db()
        self.assertEqual(self.recipient.reminder_count, 1)
        self.assertIsNotNone(self.recipient.last_reminded_at)

        send_due_reminders()
        self.recipient.refresh_from_db()
        self.assertEqual(self.recipient.reminder_count, 1)

    def test_reminders_can_be_disabled(self):
        from apps.envelopes.tasks import send_due_reminders

        self.tenant.reminders_enabled = False
        self.tenant.save(update_fields=["reminders_enabled"])
        send_due_reminders()
        self.recipient.refresh_from_db()
        self.assertEqual(self.recipient.reminder_count, 0)

    def test_retention_purge_removes_downloadable_files(self):
        from apps.envelopes.tasks import purge_expired_retained_documents

        self.envelope.status = Envelope.Status.COMPLETED
        self.envelope.completed_at = timezone.now() - timedelta(days=40)
        self.envelope.signed_file.save("signed.pdf", ContentFile(b"%PDF-1.4 signed"), save=False)
        self.envelope.certificate_file.save("cert.pdf", ContentFile(b"%PDF-1.4 cert"), save=False)
        self.envelope.save()

        purged = purge_expired_retained_documents()
        self.assertEqual(purged, 1)
        self.envelope.refresh_from_db()
        self.assertTrue(self.envelope.retention_purged_at)
        self.assertFalse(bool(self.envelope.signed_file))
        self.assertFalse(bool(self.envelope.certificate_file))

    def test_expire_envelopes_marks_past_due(self):
        from apps.audit.models import AuditEvent
        from apps.envelopes.tasks import expire_envelopes

        self.envelope.expires_at = timezone.now() - timedelta(hours=1)
        self.envelope.save(update_fields=["expires_at", "updated_at"])

        expired = expire_envelopes()
        self.assertEqual(expired, 1)
        self.envelope.refresh_from_db()
        self.assertEqual(self.envelope.status, Envelope.Status.EXPIRED)
        self.assertTrue(
            AuditEvent.objects.filter(
                envelope=self.envelope, event_type=AuditEvent.EventType.EXPIRED
            ).exists()
        )

    def test_certificate_uses_tenant_brand_and_contact(self):
        import io

        from apps.envelopes.services import generate_certificate_pdf

        self.envelope.status = Envelope.Status.COMPLETED
        self.envelope.completed_at = timezone.now()
        self.envelope.save()
        cert = generate_certificate_pdf(self.envelope)
        reader = PdfReader(io.BytesIO(cert))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        self.assertIn("Policy Co", text)
        self.assertIn("America/Chicago", text)
        self.assertIn("legal@policy.test", text)
        self.assertIn("30 days", text)


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class StampOnSendDocumentFieldsTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Stamp Co", slug="stamp-co")
        self.user = User.objects.create_user(email="owner@stamp.test", password="password123")
        Membership.objects.create(tenant=self.tenant, user=self.user, role=Membership.Role.OWNER)
        pdf = SimpleUploadedFile("doc.pdf", _multi_page_pdf(1), content_type="application/pdf")
        self.document = Document.objects.create(
            tenant=self.tenant,
            title="Offer",
            original_filename="doc.pdf",
            created_by=self.user,
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
            title="Offer",
            document=self.document,
            document_version=self.version,
            created_by=self.user,
            merge_data={"price": "425000", "custom": {"lender_name": "First National"}},
        )
        self.buyer = Recipient.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            name="Buyer One",
            email="buyer@example.com",
            role_key="buyer",
            routing_order=1,
        )
        self.agent = Recipient.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            name="Agent",
            email="agent@example.com",
            role_key="agent",
            routing_order=2,
        )
        self.doc_field = Field.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            recipient=None,
            field_type=Field.FieldType.TEXT,
            page=1,
            x=0.1,
            y=0.8,
            w=0.5,
            h=0.04,
            required=True,
            label="Purchase price",
            merge_token="deal.price",
            fill_mode=Field.FillMode.DOCUMENT,
            value="425000",
        )
        self.lender_field = Field.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            recipient=None,
            field_type=Field.FieldType.TEXT,
            page=1,
            x=0.1,
            y=0.74,
            w=0.5,
            h=0.04,
            required=False,
            label="Lender Name",
            merge_token="custom.lender_name",
            fill_mode=Field.FillMode.DOCUMENT,
            value="First National",
        )
        self.name_field = Field.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            recipient=None,
            field_type=Field.FieldType.TEXT,
            page=1,
            x=0.1,
            y=0.68,
            w=0.5,
            h=0.04,
            required=False,
            label="Buyer legal name",
            merge_token="role.buyer.name",
            fill_mode=Field.FillMode.DOCUMENT,
            value="",
        )
        self.sig_field = Field.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            recipient=self.buyer,
            field_type=Field.FieldType.SIGNATURE,
            page=1,
            x=0.1,
            y=0.2,
            w=0.3,
            h=0.06,
            required=True,
            label="Buyer signature",
            fill_mode=Field.FillMode.SIGNER,
        )
        self.title_field = Field.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            recipient=self.buyer,
            field_type=Field.FieldType.TEXT,
            page=1,
            x=0.1,
            y=0.3,
            w=0.3,
            h=0.04,
            required=True,
            label="Job title",
            fill_mode=Field.FillMode.SIGNER,
        )

    def test_send_stamps_document_fields_and_marks_completed(self):
        from apps.envelopes.services import send_envelope

        original_version_id = self.version.id
        send_envelope(self.envelope)
        self.envelope.refresh_from_db()
        self.doc_field.refresh_from_db()
        self.lender_field.refresh_from_db()

        self.assertEqual(self.envelope.status, Envelope.Status.SENT)
        self.assertNotEqual(self.envelope.document_version_id, original_version_id)
        # Stamped PDF lives on a private document — source library PDF stays clean
        self.assertNotEqual(self.envelope.document_id, self.document.id)
        self.document.refresh_from_db()
        self.assertEqual(self.document.current_version.id, original_version_id)
        self.assertEqual(self.document.versions.count(), 1)
        self.assertIsNotNone(self.doc_field.completed_at)
        self.assertIsNotNone(self.lender_field.completed_at)

        stamped = PdfReader(self.envelope.document_version.file.path)
        text = stamped.pages[0].extract_text() or ""
        self.assertIn("425000", text)
        self.assertIn("First National", text)

        # Agent has no signer tasks — auto-marked signed, not invited
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.status, Recipient.Status.SIGNED)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.status, Recipient.Status.SENT)

    def test_prefill_resolves_role_name_onto_unassigned_document_field(self):
        from apps.envelopes.services import resolve_merge_values_for_envelope

        updated = resolve_merge_values_for_envelope(self.envelope, overwrite_with_empty=True)
        self.assertGreaterEqual(updated, 1)
        self.name_field.refresh_from_db()
        self.assertEqual(self.name_field.value, "Buyer One")
        self.assertIsNone(self.name_field.recipient_id)

    def test_required_empty_document_field_blocks_send(self):
        from apps.envelopes.services import send_envelope, validate_envelope_for_send

        self.doc_field.value = ""
        self.doc_field.merge_token = ""
        self.doc_field.save(update_fields=["value", "merge_token"])
        errors = validate_envelope_for_send(self.envelope)
        self.assertTrue(any("Purchase price" in e for e in errors))
        with self.assertRaises(ValueError):
            send_envelope(self.envelope)

    def test_final_flatten_skips_document_fields(self):
        from apps.envelopes.services import flatten_envelope_pdf, send_envelope

        send_envelope(self.envelope)
        self.envelope.refresh_from_db()
        # Signer fills title; document value already in base PDF
        self.title_field.value = "Director"
        self.title_field.completed_at = timezone.now()
        self.title_field.save(update_fields=["value", "completed_at"])
        self.sig_field.value = "Buyer One"
        self.sig_field.completed_at = timezone.now()
        self.sig_field.save(update_fields=["value", "completed_at"])

        # Change document field value after stamp — final flatten must not redraw old/new
        self.doc_field.value = "SHOULD-NOT-APPEAR-TWICE"
        self.doc_field.save(update_fields=["value"])

        pdf_bytes = flatten_envelope_pdf(self.envelope)
        text = PdfReader(io.BytesIO(pdf_bytes)).pages[0].extract_text() or ""
        self.assertIn("Director", text)
        self.assertIn("425000", text)
        self.assertNotIn("SHOULD-NOT-APPEAR-TWICE", text)

    def test_signing_session_omits_document_fields(self):
        from apps.envelopes.services import send_envelope
        from rest_framework.test import APIClient

        send_envelope(self.envelope)
        self.buyer.refresh_from_db()
        client = APIClient()
        res = client.get(f"/api/sign/{self.buyer.access_token}/")
        self.assertEqual(res.status_code, 200)
        field_ids = {f["id"] for f in res.data["fields"]}
        self.assertIn(self.sig_field.id, field_ids)
        self.assertIn(self.title_field.id, field_ids)
        self.assertNotIn(self.doc_field.id, field_ids)
        self.assertNotIn(self.lender_field.id, field_ids)

        # Stamped PDF served to signer includes document values
        version = self.envelope.document_version
        text = PdfReader(version.file.path).pages[0].extract_text() or ""
        self.assertIn("425000", text)


class FieldRecipientFillModeValidationTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Val", slug="val-fields")
        self.user = User.objects.create_user(email="owner@val.test", password="password123")
        Membership.objects.create(tenant=self.tenant, user=self.user, role=Membership.Role.OWNER)
        pdf = SimpleUploadedFile("doc.pdf", _multi_page_pdf(1), content_type="application/pdf")
        self.document = Document.objects.create(
            tenant=self.tenant,
            title="Doc",
            original_filename="doc.pdf",
            created_by=self.user,
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
            title="E",
            document=self.document,
            document_version=self.version,
            created_by=self.user,
        )
        self.recipient = Recipient.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            name="Pat",
            email="pat@example.com",
            routing_order=1,
        )

    def test_document_field_rejects_recipient(self):
        from apps.envelopes.serializers import FieldSerializer

        ser = FieldSerializer(
            data={
                "recipient": self.recipient.id,
                "field_type": "text",
                "page": 1,
                "x": 0.1,
                "y": 0.1,
                "w": 0.2,
                "h": 0.04,
                "fill_mode": "document",
                "label": "Price",
            }
        )
        self.assertFalse(ser.is_valid())
        self.assertIn("recipient", ser.errors)

    def test_signer_field_requires_recipient(self):
        from apps.envelopes.serializers import FieldSerializer

        ser = FieldSerializer(
            data={
                "recipient": None,
                "field_type": "text",
                "page": 1,
                "x": 0.1,
                "y": 0.1,
                "w": 0.2,
                "h": 0.04,
                "fill_mode": "signer",
                "label": "Title",
            }
        )
        self.assertFalse(ser.is_valid())
        self.assertIn("recipient", ser.errors)

    def test_document_field_allows_null_recipient(self):
        from apps.envelopes.serializers import FieldSerializer

        ser = FieldSerializer(
            data={
                "recipient": None,
                "field_type": "text",
                "page": 1,
                "x": 0.1,
                "y": 0.1,
                "w": 0.2,
                "h": 0.04,
                "fill_mode": "document",
                "label": "Price",
                "merge_token": "deal.price",
                "value": "100",
            }
        )
        self.assertTrue(ser.is_valid(), ser.errors)

    def test_duplicate_preserves_null_recipient_document_fields(self):
        from rest_framework.test import APIClient

        Field.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            recipient=None,
            field_type=Field.FieldType.TEXT,
            page=1,
            x=0.1,
            y=0.8,
            w=0.4,
            h=0.04,
            fill_mode=Field.FillMode.DOCUMENT,
            merge_token="deal.price",
            value="99",
            label="Price",
        )
        Field.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            recipient=self.recipient,
            field_type=Field.FieldType.SIGNATURE,
            page=1,
            x=0.1,
            y=0.2,
            w=0.3,
            h=0.06,
            fill_mode=Field.FillMode.SIGNER,
            label="Sig",
        )
        client = APIClient()
        client.force_authenticate(user=self.user)
        res = client.post(
            f"/api/envelopes/{self.envelope.id}/duplicate/",
            HTTP_HOST=f"{self.tenant.slug}.signdeskcrm.test",
            HTTP_X_TENANT_SLUG=self.tenant.slug,
        )
        self.assertEqual(res.status_code, 201, getattr(res, "data", res.content))
        clone = Envelope.objects.get(pk=res.data["id"])
        doc_fields = clone.fields.filter(fill_mode=Field.FillMode.DOCUMENT)
        self.assertEqual(doc_fields.count(), 1)
        self.assertIsNone(doc_fields.first().recipient_id)
        self.assertEqual(clone.fields.filter(fill_mode=Field.FillMode.SIGNER).count(), 1)


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class EnvelopeNotificationTests(TestCase):
    def setUp(self):
        from django.core import mail
        from rest_framework.test import APIClient

        from apps.envelopes.services import send_envelope
        from apps.tenants.models import ensure_email_templates

        self.mail = mail
        self.send_envelope = send_envelope
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name="Acme", slug="acme-notify")
        ensure_email_templates(self.tenant)
        self.user = User.objects.create_user(
            email="owner@acme-notify.test",
            password="password123",
            first_name="Pat",
            last_name="Owner",
        )
        Membership.objects.create(tenant=self.tenant, user=self.user, role=Membership.Role.OWNER)
        pdf = SimpleUploadedFile("doc.pdf", _multi_page_pdf(1), content_type="application/pdf")
        self.document = Document.objects.create(
            tenant=self.tenant,
            title="NDA",
            original_filename="doc.pdf",
            created_by=self.user,
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
            title="NDA Packet",
            document=self.document,
            document_version=self.version,
            created_by=self.user,
            routing=Envelope.Routing.SEQUENTIAL,
        )
        self.signer1 = Recipient.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            name="Buyer",
            email="buyer@example.com",
            routing_order=1,
        )
        self.signer2 = Recipient.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            name="Seller",
            email="seller@example.com",
            routing_order=2,
        )
        self.cc = Recipient.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            name="Broker",
            email="cc@example.com",
            role=Recipient.Role.CC,
            routing_order=1,
        )
        Field.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            recipient=self.signer1,
            field_type=Field.FieldType.SIGNATURE,
            page=1,
            x=0.1,
            y=0.1,
            w=0.3,
            h=0.05,
            required=True,
        )
        Field.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            recipient=self.signer2,
            field_type=Field.FieldType.SIGNATURE,
            page=1,
            x=0.1,
            y=0.3,
            w=0.3,
            h=0.05,
            required=True,
        )
        self.host = {
            "HTTP_HOST": f"{self.tenant.slug}.signdeskcrm.test",
            "HTTP_X_TENANT_SLUG": self.tenant.slug,
        }
        self.client.force_authenticate(self.user)

    def test_cc_gets_copy_notice_not_signing_invite(self):
        self.mail.outbox.clear()
        self.send_envelope(self.envelope)
        cc_mails = [m for m in self.mail.outbox if m.to == ["cc@example.com"]]
        self.assertEqual(len(cc_mails), 1)
        self.assertTrue(cc_mails[0].subject.startswith("Copy:"))
        self.assertIn("copy recipient", cc_mails[0].body.lower())
        self.assertNotIn("Review and sign", cc_mails[0].alternatives[0][0])
        self.assertIn("View document", cc_mails[0].alternatives[0][0])

    def test_void_emails_all_recipients(self):
        self.send_envelope(self.envelope)
        self.mail.outbox.clear()
        res = self.client.post(
            f"/api/envelopes/{self.envelope.id}/void/",
            {"reason": "Wrong party"},
            format="json",
            **self.host,
        )
        self.assertEqual(res.status_code, 200)
        void_mails = [m for m in self.mail.outbox if m.subject.startswith("Voided:")]
        self.assertEqual(len(void_mails), 3)
        self.assertTrue(any("Wrong party" in m.body for m in void_mails))

    def test_decline_emails_sender(self):
        from rest_framework.test import APIClient

        self.send_envelope(self.envelope)
        self.signer1.refresh_from_db()
        self.mail.outbox.clear()
        guest = APIClient()
        res = guest.post(
            f"/api/sign/{self.signer1.access_token}/decline/",
            {"reason": "Not ready"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        declined = [m for m in self.mail.outbox if m.subject.startswith("Declined:")]
        self.assertEqual(len(declined), 1)
        self.assertEqual(declined[0].to, [self.user.email])
        self.assertIn("Not ready", declined[0].body)
        self.assertIn("Buyer", declined[0].body)

    def test_resend_skips_pending_sequential_signers(self):
        self.send_envelope(self.envelope)
        self.signer1.refresh_from_db()
        self.signer2.refresh_from_db()
        self.assertEqual(self.signer1.status, Recipient.Status.SENT)
        self.assertEqual(self.signer2.status, Recipient.Status.PENDING)
        self.mail.outbox.clear()
        res = self.client.post(
            f"/api/envelopes/{self.envelope.id}/resend/",
            format="json",
            **self.host,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["resent"], 1)
        recipients = {tuple(m.to) for m in self.mail.outbox}
        self.assertEqual(recipients, {("buyer@example.com",)})
