from pathlib import Path
from io import StringIO

from django.core.files.base import ContentFile
from django.core.management import call_command
from django.test import TestCase, override_settings

from apps.accounts.models import User
from apps.common.media_inventory import build_media_inventory
from apps.documents.models import Document, DocumentVersion
from apps.tenants.models import Membership, Tenant


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class MediaOrphanCleanupTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Acme", slug="acme-media-clean")
        self.user = User.objects.create_user(
            email="owner@acme-media-clean.test", password="password123"
        )
        Membership.objects.create(
            tenant=self.tenant, user=self.user, role=Membership.Role.OWNER
        )

    def test_new_document_upload_uses_tenant_prefix(self):
        document = Document.objects.create(
            tenant=self.tenant, title="Doc", original_filename="a.pdf", created_by=self.user
        )
        version = DocumentVersion(tenant=self.tenant, document=document, version_number=1)
        version.file.save("a.pdf", ContentFile(b"%PDF-1.4 orphan-test"), save=True)
        self.assertTrue(version.file.name.startswith(f"tenants/{self.tenant.pk}/documents/"))

    def test_document_version_delete_removes_file(self):
        document = Document.objects.create(
            tenant=self.tenant, title="Doc", original_filename="a.pdf", created_by=self.user
        )
        version = DocumentVersion(tenant=self.tenant, document=document, version_number=1)
        version.file.save("a.pdf", ContentFile(b"%PDF-1.4 orphan-test"), save=True)
        path = Path(version.file.path)
        self.assertTrue(path.exists())
        version.delete()
        self.assertFalse(path.exists())

    def test_audit_command_finds_and_deletes_orphan(self):
        from django.conf import settings

        media_root = Path(settings.MEDIA_ROOT)
        orphan_dir = media_root / "documents" / "2099" / "01"
        orphan_dir.mkdir(parents=True, exist_ok=True)
        orphan = orphan_dir / "orphan-only.pdf"
        orphan.write_bytes(b"%PDF-1.4 leftover")

        inventory = build_media_inventory()
        self.assertIn("documents/2099/01/orphan-only.pdf", inventory.orphans)

        out = StringIO()
        call_command("audit_media_orphans", "--delete", "--prefix", "documents", stdout=out)
        self.assertFalse(orphan.exists())
        self.assertIn("Deleted", out.getvalue())
