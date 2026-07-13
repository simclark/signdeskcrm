import io

from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
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
