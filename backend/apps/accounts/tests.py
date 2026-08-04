from datetime import timedelta

from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import PasswordResetToken, User
from apps.tenants.models import Membership, Tenant, ensure_email_templates


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class PasswordResetTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Acme", slug="acme-reset")
        ensure_email_templates(self.tenant)
        self.user = User.objects.create_user(email="member@acme.test", password="oldpassword1")
        Membership.objects.create(
            tenant=self.tenant, user=self.user, role=Membership.Role.MEMBER
        )
        self.client = APIClient()
        self.headers = {
            "HTTP_HOST": "acme-reset.signdeskcrm.test",
            "HTTP_X_TENANT_SLUG": "acme-reset",
        }

    def test_request_sends_email_for_active_member(self):
        res = self.client.post(
            "/api/auth/password-reset/",
            {"email": "member@acme.test"},
            format="json",
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(PasswordResetToken.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 1)
        reset = PasswordResetToken.objects.get()
        self.assertIn(reset.token, mail.outbox[0].body)

    def test_request_unknown_email_is_opaque(self):
        res = self.client.post(
            "/api/auth/password-reset/",
            {"email": "nobody@acme.test"},
            format="json",
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(PasswordResetToken.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_confirm_sets_new_password(self):
        self.client.post(
            "/api/auth/password-reset/",
            {"email": "member@acme.test"},
            format="json",
            **self.headers,
        )
        reset = PasswordResetToken.objects.get()
        detail = self.client.get(
            f"/api/auth/password-reset/{reset.token}/",
            **self.headers,
        )
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["email"], "member@acme.test")

        confirm = self.client.post(
            f"/api/auth/password-reset/{reset.token}/confirm/",
            {"password": "newpassword99"},
            format="json",
            **self.headers,
        )
        self.assertEqual(confirm.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("newpassword99"))
        reset.refresh_from_db()
        self.assertIsNotNone(reset.used_at)

        reuse = self.client.post(
            f"/api/auth/password-reset/{reset.token}/confirm/",
            {"password": "anotherpassword1"},
            format="json",
            **self.headers,
        )
        self.assertEqual(reuse.status_code, 410)

    def test_expired_token_rejected(self):
        reset = PasswordResetToken.objects.create(user=self.user, tenant=self.tenant)
        reset.expires_at = timezone.now() - timedelta(hours=1)
        reset.save(update_fields=["expires_at"])
        res = self.client.get(
            f"/api/auth/password-reset/{reset.token}/",
            **self.headers,
        )
        self.assertEqual(res.status_code, 410)

    def test_tenant_token_rejected_on_wrong_host(self):
        reset = PasswordResetToken.objects.create(user=self.user, tenant=self.tenant)
        res = self.client.get(
            f"/api/auth/password-reset/{reset.token}/",
            HTTP_HOST="platform.signdeskcrm.test",
        )
        self.assertEqual(res.status_code, 404)


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class PlatformPasswordResetTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            email="ops@signdesk.test",
            password="oldpassword1",
            is_staff=True,
        )
        self.member = User.objects.create_user(
            email="member@acme.test",
            password="oldpassword1",
        )
        self.client = APIClient()
        self.headers = {"HTTP_HOST": "platform.signdeskcrm.test"}

    def test_request_sends_email_for_staff(self):
        res = self.client.post(
            "/api/auth/password-reset/",
            {"email": "ops@signdesk.test"},
            format="json",
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(PasswordResetToken.objects.count(), 1)
        reset = PasswordResetToken.objects.get()
        self.assertIsNone(reset.tenant_id)
        self.assertTrue(reset.is_platform)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(reset.token, mail.outbox[0].body)
        self.assertIn("platform.signdeskcrm.test", mail.outbox[0].body)

    def test_request_non_staff_is_opaque(self):
        res = self.client.post(
            "/api/auth/password-reset/",
            {"email": "member@acme.test"},
            format="json",
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(PasswordResetToken.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_confirm_sets_new_password(self):
        self.client.post(
            "/api/auth/password-reset/",
            {"email": "ops@signdesk.test"},
            format="json",
            **self.headers,
        )
        reset = PasswordResetToken.objects.get()
        detail = self.client.get(
            f"/api/auth/password-reset/{reset.token}/",
            **self.headers,
        )
        self.assertEqual(detail.status_code, 200)
        self.assertTrue(detail.data["is_platform"])
        self.assertEqual(detail.data["tenant_name"], "SignDesk Platform")

        confirm = self.client.post(
            f"/api/auth/password-reset/{reset.token}/confirm/",
            {"password": "newpassword99"},
            format="json",
            **self.headers,
        )
        self.assertEqual(confirm.status_code, 200)
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.check_password("newpassword99"))

    def test_platform_token_rejected_on_tenant_host(self):
        reset = PasswordResetToken.objects.create(user=self.staff, tenant=None)
        Tenant.objects.create(name="Acme", slug="acme-plat")
        res = self.client.get(
            f"/api/auth/password-reset/{reset.token}/",
            HTTP_HOST="acme-plat.signdeskcrm.test",
            HTTP_X_TENANT_SLUG="acme-plat",
        )
        self.assertEqual(res.status_code, 404)
