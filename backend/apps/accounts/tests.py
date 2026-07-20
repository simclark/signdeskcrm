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
