import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from reportlab.pdfgen import canvas
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.documents.form_library.ensure import ensure_form_library
from apps.documents.models import Document, DocumentVersion, Template
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
class FormLibraryEnsureTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Lib Co", slug="lib-co")

    def test_ensure_creates_catalog_form(self):
        stats = ensure_form_library(self.tenant)
        self.assertEqual(stats["created"], 1)
        self.assertEqual(stats["updated"], 0)
        tpl = Template.objects.get(tenant=self.tenant, library_key="sample-purchase-agreement")
        self.assertTrue(tpl.is_library)
        self.assertTrue(tpl.field_layout)

    def test_ensure_idempotent(self):
        ensure_form_library(self.tenant)
        stats = ensure_form_library(self.tenant)
        self.assertEqual(stats["created"], 0)
        self.assertEqual(stats["skipped"], 1)
        self.assertEqual(
            Template.objects.filter(
                tenant=self.tenant, library_key="sample-purchase-agreement"
            ).count(),
            1,
        )

    def test_ensure_replace_refreshes_keyed_only(self):
        ensure_form_library(self.tenant)
        tpl = Template.objects.get(tenant=self.tenant, library_key="sample-purchase-agreement")
        tpl.name = "Mutated"
        tpl.save(update_fields=["name"])

        doc = Document.objects.create(
            tenant=self.tenant, title="Tenant Form", original_filename="t.pdf"
        )
        DocumentVersion.objects.create(
            tenant=self.tenant,
            document=doc,
            version_number=1,
            file=SimpleUploadedFile("t.pdf", _pdf_bytes(), content_type="application/pdf"),
        )
        tenant_lib = Template.objects.create(
            tenant=self.tenant,
            name="Our Listing Packet",
            document=doc,
            is_library=True,
            library_key=None,
        )

        stats = ensure_form_library(self.tenant, replace=True)
        self.assertEqual(stats["updated"], 1)
        tpl.refresh_from_db()
        self.assertEqual(tpl.name, "Sample Purchase Agreement")
        tenant_lib.refresh_from_db()
        self.assertEqual(tenant_lib.name, "Our Listing Packet")
        self.assertTrue(tenant_lib.is_library)

    def test_cli_all_tenants(self):
        other = Tenant.objects.create(name="Other", slug="other-lib")
        call_command("seed_form_library", all_tenants=True)
        self.assertTrue(
            Template.objects.filter(
                tenant=self.tenant, library_key="sample-purchase-agreement"
            ).exists()
        )
        self.assertTrue(
            Template.objects.filter(
                tenant=other, library_key="sample-purchase-agreement"
            ).exists()
        )


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class FormLibraryApiTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Lib API", slug="lib-api")
        self.owner = User.objects.create_user(email="owner@lib-api.test", password="password123")
        self.member = User.objects.create_user(email="member@lib-api.test", password="password123")
        Membership.objects.create(
            tenant=self.tenant, user=self.owner, role=Membership.Role.OWNER
        )
        Membership.objects.create(
            tenant=self.tenant, user=self.member, role=Membership.Role.MEMBER
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.kw = {
            "HTTP_HOST": "lib-api.signdeskcrm.test",
            "HTTP_X_TENANT_SLUG": "lib-api",
        }

        self.document = Document.objects.create(
            tenant=self.tenant,
            title="Custom Form",
            original_filename="c.pdf",
            created_by=self.owner,
        )
        DocumentVersion.objects.create(
            tenant=self.tenant,
            document=self.document,
            version_number=1,
            file=SimpleUploadedFile("c.pdf", _pdf_bytes(), content_type="application/pdf"),
        )
        self.template = Template.objects.create(
            tenant=self.tenant,
            name="Custom Form",
            document=self.document,
            created_by=self.owner,
            is_library=False,
        )

    def test_library_list_lazy_syncs_catalog(self):
        self.assertFalse(
            Template.objects.filter(
                tenant=self.tenant, library_key="sample-purchase-agreement"
            ).exists()
        )
        res = self.client.get("/api/templates/?library=true", **self.kw)
        self.assertEqual(res.status_code, 200)
        keys = {row["library_key"] for row in res.data["results"]}
        self.assertIn("sample-purchase-agreement", keys)

    def test_promote_and_demote(self):
        res = self.client.post(
            f"/api/templates/{self.template.id}/add-to-library/", **self.kw
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["is_library"])
        self.assertIsNone(res.data["library_key"])

        res = self.client.post(
            f"/api/templates/{self.template.id}/remove-from-library/", **self.kw
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["is_library"])

    def test_promote_requires_admin(self):
        self.client.force_authenticate(self.member)
        res = self.client.post(
            f"/api/templates/{self.template.id}/add-to-library/", **self.kw
        )
        self.assertEqual(res.status_code, 403)

    def test_platform_form_rejects_patch_and_archive(self):
        ensure_form_library(self.tenant)
        platform = Template.objects.get(
            tenant=self.tenant, library_key="sample-purchase-agreement"
        )
        res = self.client.patch(
            f"/api/templates/{platform.id}/",
            {"field_layout": []},
            format="json",
            **self.kw,
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Clone", res.data["detail"])

        res = self.client.delete(f"/api/templates/{platform.id}/", **self.kw)
        self.assertEqual(res.status_code, 400)
        platform.refresh_from_db()
        self.assertFalse(platform.is_archived)

    def test_platform_form_clone_succeeds(self):
        ensure_form_library(self.tenant)
        platform = Template.objects.get(
            tenant=self.tenant, library_key="sample-purchase-agreement"
        )
        res = self.client.post(f"/api/templates/{platform.id}/clone/", {}, format="json", **self.kw)
        self.assertEqual(res.status_code, 201)
        self.assertFalse(res.data["is_library"])
        self.assertIsNone(res.data["library_key"])

    def test_cannot_remove_platform_from_library(self):
        ensure_form_library(self.tenant)
        platform = Template.objects.get(
            tenant=self.tenant, library_key="sample-purchase-agreement"
        )
        res = self.client.post(
            f"/api/templates/{platform.id}/remove-from-library/", **self.kw
        )
        self.assertEqual(res.status_code, 400)

    def test_is_library_not_writable_via_patch(self):
        res = self.client.patch(
            f"/api/templates/{self.template.id}/",
            {"is_library": True},
            format="json",
            **self.kw,
        )
        self.assertEqual(res.status_code, 200)
        self.template.refresh_from_db()
        self.assertFalse(self.template.is_library)


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class SignupFormLibraryTests(TestCase):
    def test_signup_seeds_form_library(self):
        client = APIClient()
        res = client.post(
            "/api/auth/signup/",
            {
                "company_name": "Fresh Co",
                "slug": "fresh-co",
                "email": "owner@fresh-co.test",
                "password": "password123",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        tenant = Tenant.objects.get(slug="fresh-co")
        self.assertTrue(
            Template.objects.filter(
                tenant=tenant, library_key="sample-purchase-agreement", is_library=True
            ).exists()
        )
