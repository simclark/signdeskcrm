from django.test import SimpleTestCase
from django.utils import timezone

from apps.common.upload_paths import (
    document_upload_to,
    is_tenant_prefixed,
    tenant_icon_upload_to,
    tenant_logo_upload_to,
)


class _FakeTenantOwned:
    def __init__(self, tenant_id: int):
        self.tenant_id = tenant_id


class _FakeTenant:
    def __init__(self, pk=None, slug="acme"):
        self.pk = pk
        self.slug = slug


class UploadPathsTests(SimpleTestCase):
    def test_document_path_includes_tenant_and_date(self):
        now = timezone.now()
        path = document_upload_to(_FakeTenantOwned(7), "Offer Letter.pdf")
        self.assertEqual(
            path,
            f"tenants/7/documents/{now:%Y/%m}/Offer_Letter.pdf",
        )

    def test_branding_uses_pk_or_slug(self):
        path = tenant_logo_upload_to(_FakeTenant(pk=3), "logo.png")
        self.assertEqual(path, "tenants/3/branding/logo/logo.png")
        path = tenant_icon_upload_to(_FakeTenant(pk=None), "icon.png")
        self.assertEqual(path, "tenants/acme/branding/icon/icon.png")

    def test_is_tenant_prefixed(self):
        self.assertTrue(is_tenant_prefixed("tenants/1/documents/2026/07/a.pdf"))
        self.assertFalse(is_tenant_prefixed("documents/2026/07/a.pdf"))
        self.assertFalse(is_tenant_prefixed(""))
