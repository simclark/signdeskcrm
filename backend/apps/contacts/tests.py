from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.contacts.models import Activity, Company, Contact
from apps.documents.models import Document, DocumentVersion
from apps.envelopes.models import Envelope, Recipient
from apps.tenants.models import Membership, Tenant


class ContactCompanyPhase2Tests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name="Acme", slug="acme-crm")
        self.user = User.objects.create_user(email="owner@acme-crm.test", password="password123")
        Membership.objects.create(tenant=self.tenant, user=self.user, role=Membership.Role.OWNER)
        self.client.force_authenticate(self.user)
        self.host = {"HTTP_HOST": "acme-crm.signdeskcrm.test", "HTTP_X_TENANT_SLUG": "acme-crm"}

        self.company = Company.objects.create(tenant=self.tenant, name="Globex")
        self.contact = Contact.objects.create(
            tenant=self.tenant,
            company=self.company,
            first_name="Ada",
            last_name="Lovelace",
            email="ada@globex.test",
        )
        self.document = Document.objects.create(
            tenant=self.tenant,
            title="NDA",
            original_filename="nda.pdf",
            created_by=self.user,
        )
        pdf = SimpleUploadedFile("nda.pdf", b"%PDF-1.4 test", content_type="application/pdf")
        self.version = DocumentVersion(
            tenant=self.tenant,
            document=self.document,
            version_number=1,
            file=pdf,
            page_count=1,
        )
        self.version.save()
        self.envelope = Envelope.objects.create(
            tenant=self.tenant,
            title="NDA for Ada",
            document=self.document,
            document_version=self.version,
            created_by=self.user,
            status=Envelope.Status.SENT,
            sent_at=timezone.now(),
        )
        Recipient.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            contact=self.contact,
            name=self.contact.full_name,
            email=self.contact.email,
            status=Recipient.Status.SENT,
            sent_at=timezone.now(),
        )

    def test_add_contact_note(self):
        res = self.client.post(
            f"/api/contacts/{self.contact.id}/notes/",
            {"message": "Called about renewal"},
            format="json",
            **self.host,
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["kind"], Activity.Kind.NOTE)
        self.assertEqual(res.data["message"], "Called about renewal")
        self.assertTrue(
            Activity.objects.filter(
                contact=self.contact, kind=Activity.Kind.NOTE, message="Called about renewal"
            ).exists()
        )

    def test_add_company_note(self):
        res = self.client.post(
            f"/api/companies/{self.company.id}/notes/",
            {"message": "Account healthy"},
            format="json",
            **self.host,
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["kind"], Activity.Kind.NOTE)

    def test_related_envelopes(self):
        contact_res = self.client.get(
            f"/api/contacts/{self.contact.id}/envelopes/", **self.host
        )
        self.assertEqual(contact_res.status_code, 200)
        self.assertEqual(len(contact_res.data), 1)
        self.assertEqual(contact_res.data[0]["id"], self.envelope.id)

        company_res = self.client.get(
            f"/api/companies/{self.company.id}/envelopes/", **self.host
        )
        self.assertEqual(company_res.status_code, 200)
        self.assertEqual(len(company_res.data), 1)
        self.assertEqual(company_res.data[0]["id"], self.envelope.id)
