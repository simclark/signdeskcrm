from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.contacts.models import Contact
from apps.tenants.models import Invitation, Membership, PlatformOpsEvent, Tenant


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
            "/api/contacts/", HTTP_HOST="acme-esign.signdeskcrm.test", HTTP_X_TENANT_SLUG="acme-esign"
        )
        res_b = self.client_b.get(
            "/api/contacts/", HTTP_HOST="globex.signdeskcrm.test", HTTP_X_TENANT_SLUG="globex"
        )
        self.assertEqual(res_a.status_code, 200)
        self.assertEqual(res_b.status_code, 200)
        emails_a = {c["email"] for c in res_a.data["results"]}
        emails_b = {c["email"] for c in res_b.data["results"]}
        self.assertEqual(emails_a, {"alice@acme.test"})
        self.assertEqual(emails_b, {"bob@globex.test"})

    def test_cross_tenant_member_denied(self):
        res = self.client_a.get(
            "/api/contacts/", HTTP_HOST="globex.signdeskcrm.test", HTTP_X_TENANT_SLUG="globex"
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
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class InvitationTests(TestCase):
    def setUp(self):
        from django.core import mail

        mail.outbox.clear()
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name="Acme", slug="acme-esign")
        self.owner = User.objects.create_user(email="owner@acme.test", password="password123")
        Membership.objects.create(
            tenant=self.tenant, user=self.owner, role=Membership.Role.OWNER
        )
        self.client.force_authenticate(self.owner)
        self.headers = {
            "HTTP_HOST": "acme-esign.signdeskcrm.test",
            "HTTP_X_TENANT_SLUG": "acme-esign",
        }

    def test_invite_sends_email_and_accept_creates_member(self):
        from django.core import mail

        from apps.tenants.models import Invitation

        res = self.client.post(
            "/api/tenant/invitations/",
            {"email": "new@acme.test", "role": "member"},
            format="json",
            **self.headers,
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("create your password", mail.outbox[0].body)

        invitation = Invitation.objects.get(email="new@acme.test")
        self.assertIn(invitation.token, mail.outbox[0].body)

        accept = APIClient().post(
            f"/api/auth/invitations/{invitation.token}/accept/",
            {
                "password": "SecurePass123!",
                "first_name": "New",
                "last_name": "Member",
            },
            format="json",
            **self.headers,
        )
        self.assertEqual(accept.status_code, 201, accept.data)
        self.assertTrue(
            Membership.objects.filter(
                tenant=self.tenant,
                user__email="new@acme.test",
                role=Membership.Role.MEMBER,
            ).exists()
        )
        invitation.refresh_from_db()
        self.assertIsNotNone(invitation.accepted_at)

    def test_cannot_invite_existing_member(self):
        res = self.client.post(
            "/api/tenant/invitations/",
            {"email": "owner@acme.test", "role": "admin"},
            format="json",
            **self.headers,
        )
        self.assertEqual(res.status_code, 400)


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


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class EmailTemplateTests(TestCase):
    def setUp(self):
        from apps.tenants.email_templates import EmailTemplateKey
        from apps.tenants.models import EmailTemplate, ensure_email_templates

        self.EmailTemplateKey = EmailTemplateKey
        self.EmailTemplate = EmailTemplate
        self.ensure_email_templates = ensure_email_templates

        self.tenant = Tenant.objects.create(name="Acme", slug="acme-mail")
        self.user = User.objects.create_user(email="owner@acme-mail.test", password="password123")
        Membership.objects.create(tenant=self.tenant, user=self.user, role=Membership.Role.OWNER)
        ensure_email_templates(self.tenant)

        self.member = User.objects.create_user(email="member@acme-mail.test", password="password123")
        Membership.objects.create(
            tenant=self.tenant, user=self.member, role=Membership.Role.MEMBER
        )

        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.host = {"HTTP_HOST": "acme-mail.signdeskcrm.test", "HTTP_X_TENANT_SLUG": "acme-mail"}

    def test_list_email_templates(self):
        res = self.client.get("/api/tenant/email-templates/", **self.host)
        self.assertEqual(res.status_code, 200)
        keys = [row["key"] for row in res.data]
        self.assertEqual(
            keys,
            [
                "workspace_invite",
                "password_reset",
                "signing_invite",
                "signing_reminder",
                "cc_notice",
                "completion",
                "envelope_voided",
                "envelope_declined",
            ],
        )
        self.assertIn("available_placeholders", res.data[0])

    def test_member_cannot_edit_templates(self):
        member_client = APIClient()
        member_client.force_authenticate(self.member)
        res = member_client.get("/api/tenant/email-templates/", **self.host)
        self.assertEqual(res.status_code, 403)

    def test_update_and_restore_template(self):
        key = self.EmailTemplateKey.SIGNING_INVITE
        res = self.client.patch(
            f"/api/tenant/email-templates/{key}/",
            {"subject": "Custom: {{envelope_title}}", "body": "Please sign {{envelope_title}}."},
            format="json",
            **self.host,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["subject"], "Custom: {{envelope_title}}")

        restored = self.client.post(f"/api/tenant/email-templates/{key}/restore/", **self.host)
        self.assertEqual(restored.status_code, 200)
        self.assertIn("Please sign:", restored.data["subject"])

    def test_send_uses_custom_template_and_html(self):
        from django.core import mail

        from apps.tenants.mail import send_templated_email

        template = self.EmailTemplate.objects.get(
            tenant=self.tenant, key=self.EmailTemplateKey.SIGNING_INVITE
        )
        template.subject = "Sign now: {{envelope_title}}"
        template.body = "Hello {{recipient_name}}, please sign {{envelope_title}}."
        template.save()

        send_templated_email(
            tenant=self.tenant,
            key=self.EmailTemplateKey.SIGNING_INVITE,
            to_email="signer@example.com",
            context={
                "recipient_name": "Ada",
                "tenant_name": self.tenant.name,
                "envelope_title": "NDA",
                "envelope_message": "",
                "action_url": "https://example.com/sign",
            },
            action_url="https://example.com/sign",
        )
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.subject, "Sign now: NDA")
        self.assertIn("Ada", message.body)
        self.assertTrue(message.alternatives)
        html = message.alternatives[0][0]
        self.assertIn("Acme", html)
        self.assertIn("Review and sign", html)

    def test_signup_seeds_email_templates(self):
        client = APIClient()
        res = client.post(
            "/api/auth/signup/",
            {
                "company_name": "Mail Co",
                "slug": "mail-co",
                "email": "owner@mail-co.test",
                "password": "password123",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        tenant = Tenant.objects.get(slug="mail-co")
        self.assertEqual(
            self.EmailTemplate.objects.filter(tenant=tenant).count(),
            len(self.EmailTemplateKey.ALL),
        )


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class MembershipLifecycleTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Acme", slug="acme-members")
        self.owner = User.objects.create_user(email="owner@acme.test", password="password123")
        self.admin = User.objects.create_user(email="admin@acme.test", password="password123")
        self.member = User.objects.create_user(email="member@acme.test", password="password123")
        Membership.objects.create(tenant=self.tenant, user=self.owner, role=Membership.Role.OWNER)
        Membership.objects.create(tenant=self.tenant, user=self.admin, role=Membership.Role.ADMIN)
        self.member_membership = Membership.objects.create(
            tenant=self.tenant, user=self.member, role=Membership.Role.MEMBER
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.headers = {
            "HTTP_HOST": "acme-members.signdeskcrm.test",
            "HTTP_X_TENANT_SLUG": "acme-members",
        }

    def test_promote_member_to_admin(self):
        res = self.client.patch(
            f"/api/tenant/members/{self.member_membership.id}/",
            {"role": "admin"},
            format="json",
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.member_membership.refresh_from_db()
        self.assertEqual(self.member_membership.role, Membership.Role.ADMIN)

    def test_deactivate_member(self):
        res = self.client.patch(
            f"/api/tenant/members/{self.member_membership.id}/",
            {"is_active": False},
            format="json",
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.member_membership.refresh_from_db()
        self.assertFalse(self.member_membership.is_active)

    def test_cannot_deactivate_owner(self):
        owner_membership = Membership.objects.get(tenant=self.tenant, user=self.owner)
        res = self.client.patch(
            f"/api/tenant/members/{owner_membership.id}/",
            {"is_active": False},
            format="json",
            **self.headers,
        )
        self.assertEqual(res.status_code, 400)

    def test_list_includes_inactive_and_reactivate(self):
        self.member_membership.is_active = False
        self.member_membership.save(update_fields=["is_active"])
        res = self.client.get("/api/tenant/members/", **self.headers)
        self.assertEqual(res.status_code, 200)
        rows = res.data["results"] if isinstance(res.data, dict) and "results" in res.data else res.data
        by_id = {row["id"]: row for row in rows}
        self.assertFalse(by_id[self.member_membership.id]["is_active"])

        reactivate = self.client.patch(
            f"/api/tenant/members/{self.member_membership.id}/",
            {"is_active": True},
            format="json",
            **self.headers,
        )
        self.assertEqual(reactivate.status_code, 200)
        self.member_membership.refresh_from_db()
        self.assertTrue(self.member_membership.is_active)

    def test_admin_send_password_reset(self):
        from django.core import mail
        from django.test import override_settings
        from apps.tenants.models import ensure_email_templates

        ensure_email_templates(self.tenant)
        with override_settings(
            CELERY_TASK_ALWAYS_EAGER=True,
            EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        ):
            res = self.client.post(
                f"/api/tenant/members/{self.member_membership.id}/send-password-reset/",
                **self.headers,
            )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(len(mail.outbox), 1)
        from apps.accounts.models import PasswordResetToken

        self.assertTrue(
            PasswordResetToken.objects.filter(user=self.member, tenant=self.tenant).exists()
        )


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class PlatformOpsTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            email="ops@signdesk.test",
            password="password123",
            is_staff=True,
        )
        self.user = User.objects.create_user(email="user@signdesk.test", password="password123")
        self.client = APIClient()

    def test_platform_requires_staff(self):
        self.client.force_authenticate(self.user)
        res = self.client.get("/api/platform/tenants/")
        self.assertEqual(res.status_code, 403)

    def test_provision_tenant_via_platform(self):
        self.client.force_authenticate(self.staff)
        res = self.client.post(
            "/api/platform/tenants/",
            {
                "name": "Partner Co",
                "slug": "partner-co",
                "owner_email": "owner@partner.test",
                "owner_password": "password123",
                "owner_first_name": "Pat",
                "owner_last_name": "Owner",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        tenant = Tenant.objects.get(slug="partner-co")
        self.assertEqual(tenant.primary_contact_email, "owner@partner.test")
        self.assertEqual(tenant.primary_contact_name, "Pat Owner")
        self.assertTrue(
            Membership.objects.filter(
                tenant=tenant,
                user__email="owner@partner.test",
                role=Membership.Role.OWNER,
            ).exists()
        )
        self.assertTrue(
            PlatformOpsEvent.objects.filter(
                action=PlatformOpsEvent.Action.PROVISION, tenant=tenant
            ).exists()
        )

    def test_provision_without_password_sends_admin_invite(self):
        self.client.force_authenticate(self.staff)
        res = self.client.post(
            "/api/platform/tenants/",
            {
                "name": "Invite Co",
                "slug": "invite-co",
                "owner_email": "admin@invite.test",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertIsNotNone(res.data["invitation_id"])
        self.assertIsNotNone(res.data["invite_url"])
        self.assertEqual(res.data["invite_role"], Invitation.Role.ADMIN)
        tenant = Tenant.objects.get(slug="invite-co")
        self.assertEqual(tenant.primary_contact_email, "admin@invite.test")

    def test_demo_slug_is_reserved(self):
        from django.core.exceptions import ValidationError

        from apps.tenants.models import validate_tenant_slug

        with self.assertRaises(ValidationError):
            validate_tenant_slug("demo")

    def test_platform_health(self):
        self.client.force_authenticate(self.staff)
        res = self.client.get("/api/platform/health/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("checks", res.data)
        self.assertIn("config", res.data)
        self.assertIn("base_domain", res.data["config"])

    def test_seed_form_library(self):
        self.client.force_authenticate(self.staff)
        tenant = Tenant.objects.create(name="Seed Co", slug="seed-co")
        res = self.client.post(
            f"/api/platform/tenants/{tenant.id}/seed-form-library/",
            {"replace": False},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertGreaterEqual(res.data.get("created", 0), 1)

    def test_support_snapshot(self):
        self.client.force_authenticate(self.staff)
        tenant = Tenant.objects.create(name="Support Co", slug="support-co")
        res = self.client.get(f"/api/platform/tenants/{tenant.id}/support-snapshot/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("envelope_counts", res.data)
        self.assertIn("note", res.data)

    def test_media_orphans_report(self):
        self.client.force_authenticate(self.staff)
        res = self.client.get("/api/platform/media/orphans/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("orphan_count", res.data)
        self.assertTrue(res.data["dry_run"])

    def test_ops_events_list(self):
        self.client.force_authenticate(self.staff)
        self.client.post(
            "/api/platform/tenants/",
            {
                "name": "Audit Co",
                "slug": "audit-co",
                "owner_email": "a@audit.test",
                "owner_password": "password123",
            },
            format="json",
        )
        res = self.client.get("/api/platform/ops-events/")
        self.assertEqual(res.status_code, 200)
        rows = res.data if isinstance(res.data, list) else res.data.get("results", [])
        self.assertTrue(any(r["action"] == PlatformOpsEvent.Action.PROVISION for r in rows))

    def test_reset_demo_tenant(self):
        from apps.contacts.models import Contact
        from apps.documents.models import Template
        from apps.tenants.services.demo import reset_demo_tenant

        result = reset_demo_tenant(owner_password="demo-pass-123")
        self.assertEqual(result.tenant.slug, "demo")
        self.assertTrue(
            Template.objects.filter(
                tenant=result.tenant, library_key="sample-purchase-agreement"
            ).exists()
        )
        self.assertEqual(Contact.objects.filter(tenant=result.tenant).count(), 2)

        self.client.force_authenticate(self.staff)
        res = self.client.post("/api/platform/demo/reset/", {}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["owner_email"], result.owner_email)
        self.assertIn("workspace_url", res.data)

@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class PlatformHostMiddlewareTests(TestCase):
    def test_platform_subdomain_is_not_a_tenant(self):
        from django.test import RequestFactory

        from apps.tenants.middleware import TenantMiddleware

        def get_response(request):
            return type("Resp", (), {"status_code": 200})()

        mw = TenantMiddleware(get_response)
        request = RequestFactory().get("/api/platform/me/", HTTP_HOST="platform.signdeskcrm.test")
        mw(request)
        self.assertTrue(request.is_platform)
        self.assertIsNone(request.tenant)
        self.assertFalse(request.is_apex)

    def test_platform_api_works_on_platform_host(self):
        staff = User.objects.create_user(
            email="ops2@signdesk.test", password="password123", is_staff=True
        )
        client = APIClient()
        client.force_authenticate(staff)
        res = client.get("/api/platform/tenants/", HTTP_HOST="platform.signdeskcrm.test")
        self.assertEqual(res.status_code, 200)
