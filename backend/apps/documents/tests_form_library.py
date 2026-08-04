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

    def test_ensure_is_noop(self):
        stats = ensure_form_library(self.tenant)
        self.assertEqual(stats, {"created": 0, "updated": 0, "skipped": 0})
        self.assertFalse(
            Template.objects.filter(tenant=self.tenant, library_key__isnull=False)
            .exclude(library_key="")
            .exists()
        )

    def test_cli_all_tenants_noop(self):
        other = Tenant.objects.create(name="Other", slug="other-lib")
        call_command("seed_form_library", all_tenants=True)
        self.assertFalse(
            Template.objects.filter(library_key="sample-purchase-agreement").exists()
        )
        self.assertEqual(Template.objects.filter(tenant=other).count(), 0)


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

    def test_library_list_does_not_seed_starters(self):
        res = self.client.get("/api/templates/?library=true", **self.kw)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["results"], [])
        self.assertFalse(
            Template.objects.filter(
                tenant=self.tenant, library_key="sample-purchase-agreement"
            ).exists()
        )

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

    def test_merge_tokens_omit_listing_when_listings_disabled(self):
        self.tenant.listings_enabled = False
        self.tenant.save(update_fields=["listings_enabled"])
        res = self.client.get("/api/templates/merge-tokens/", **self.kw)
        self.assertEqual(res.status_code, 200)
        tokens = res.data["tokens"]
        self.assertTrue(any(t.startswith("deal.") for t in tokens))
        self.assertTrue(any(t.startswith("role.") for t in tokens))
        self.assertFalse(any(t.startswith("listing.") for t in tokens))
        self.assertNotIn("listing", res.data["groups"])

    def test_merge_tokens_include_listing_when_listings_enabled(self):
        self.tenant.listings_enabled = True
        self.tenant.save(update_fields=["listings_enabled"])
        res = self.client.get("/api/templates/merge-tokens/", **self.kw)
        self.assertEqual(res.status_code, 200)
        tokens = res.data["tokens"]
        self.assertTrue(any(t.startswith("listing.") for t in tokens))
        self.assertEqual(res.data["groups"]["listing"], "Listing")

    def test_member_cannot_edit_shared_library_template(self):
        self.template.is_library = True
        self.template.save(update_fields=["is_library"])

        self.client.force_authenticate(self.member)
        res = self.client.patch(
            f"/api/templates/{self.template.id}/",
            {"field_layout": []},
            format="json",
            **self.kw,
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Clone", res.data["detail"])

        res = self.client.delete(f"/api/templates/{self.template.id}/", **self.kw)
        self.assertEqual(res.status_code, 400)
        self.template.refresh_from_db()
        self.assertFalse(self.template.is_archived)

    def test_member_can_clone_shared_library_template(self):
        self.template.is_library = True
        self.template.save(update_fields=["is_library"])

        self.client.force_authenticate(self.member)
        res = self.client.post(
            f"/api/templates/{self.template.id}/clone/", {}, format="json", **self.kw
        )
        self.assertEqual(res.status_code, 201)
        self.assertFalse(res.data["is_library"])
        self.assertIsNone(res.data["library_key"])

    def test_admin_can_edit_shared_library_template(self):
        self.template.is_library = True
        self.template.save(update_fields=["is_library"])

        res = self.client.patch(
            f"/api/templates/{self.template.id}/",
            {"name": "Updated Shared Form"},
            format="json",
            **self.kw,
        )
        self.assertEqual(res.status_code, 200)
        self.template.refresh_from_db()
        self.assertEqual(self.template.name, "Updated Shared Form")
        self.assertTrue(self.template.is_library)

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
    def test_signup_does_not_seed_starters(self):
        client = APIClient()
        res = client.post(
            "/api/auth/signup/",
            {
                "company_name": "Fresh Co",
                "slug": "fresh-co",
                "email": "owner@fresh-co.test",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        tenant = Tenant.objects.get(slug="fresh-co")
        self.assertFalse(
            Template.objects.filter(tenant=tenant, library_key__isnull=False)
            .exclude(library_key="")
            .exists()
        )
