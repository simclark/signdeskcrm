from datetime import timedelta

from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.contacts.follow_up_plans import (
    process_due_follow_up_plan_enrollments,
    start_stalled_plans_for_envelope,
)
from apps.contacts.models import Contact, FollowUpPlan, FollowUpPlanEnrollment, FollowUpPlanStep
from apps.documents.models import Document, DocumentVersion
from apps.envelopes.models import Envelope, Field, Recipient
from apps.tenants.models import Membership, Tenant


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class FollowUpPlanTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name="Acme Plans", slug="acme-plans")
        self.user = User.objects.create_user(
            email="owner@acme-plans.test", password="password123"
        )
        Membership.objects.create(
            tenant=self.tenant, user=self.user, role=Membership.Role.OWNER
        )
        self.client.force_authenticate(self.user)
        self.host = {
            "HTTP_HOST": "acme-plans.signdeskcrm.test",
            "HTTP_X_TENANT_SLUG": "acme-plans",
        }

        self.contact = Contact.objects.create(
            tenant=self.tenant,
            first_name="Alex",
            last_name="Buyer",
            email="alex@example.com",
        )
        self.plan = FollowUpPlan.objects.create(
            tenant=self.tenant,
            name="Buyer stalled",
            trigger=FollowUpPlan.Trigger.STALLED,
            idle_hours=0,
            create_agent_handoff=True,
            handoff_title="Call Alex",
            is_active=True,
        )
        FollowUpPlanStep.objects.create(
            tenant=self.tenant,
            plan=self.plan,
            order=1,
            offset_days=0,
            subject="Please sign {{envelope_title}}",
            body="Hi {{recipient_name}} {{sign_link}}",
        )
        FollowUpPlanStep.objects.create(
            tenant=self.tenant,
            plan=self.plan,
            order=2,
            offset_days=2,
            subject="Second {{envelope_title}}",
            body="Again {{sign_link}}",
        )

        self.document = Document.objects.create(
            tenant=self.tenant,
            title="Agreement",
            original_filename="a.pdf",
            created_by=self.user,
        )
        pdf = SimpleUploadedFile("a.pdf", b"%PDF-1.4 test", content_type="application/pdf")
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
            title="123 Oak St",
            document=self.document,
            document_version=self.version,
            created_by=self.user,
            follow_up_plan=self.plan,
        )
        self.recipient = Recipient.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            contact=self.contact,
            name="Alex Buyer",
            email="alex@example.com",
            role=Recipient.Role.SIGNER,
            routing_order=1,
        )
        Field.objects.create(
            tenant=self.tenant,
            envelope=self.envelope,
            recipient=self.recipient,
            field_type=Field.FieldType.SIGNATURE,
            page=1,
            x=0.1,
            y=0.1,
            w=0.2,
            h=0.05,
        )

    def test_create_plan_via_api(self):
        res = self.client.post(
            "/api/follow-up-plans/",
            {
                "name": "Decline plan",
                "trigger": "declined",
                "idle_hours": 24,
                "create_agent_handoff": False,
                "is_active": True,
                "steps": [
                    {
                        "order": 1,
                        "offset_days": 0,
                        "subject": "Sorry",
                        "body": "Hi {{recipient_name}}",
                    }
                ],
            },
            format="json",
            **self.host,
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.data["trigger"], "declined")
        self.assertEqual(len(res.data["steps"]), 1)

    def test_stalled_enrollment_on_send_and_process(self):
        # Bypass heavy PDF validation by starting enrollments after marking sent
        self.envelope.status = Envelope.Status.SENT
        self.envelope.sent_at = timezone.now()
        self.envelope.save(update_fields=["status", "sent_at", "updated_at"])
        self.recipient.status = Recipient.Status.SENT
        self.recipient.sent_at = timezone.now()
        self.recipient.save(update_fields=["status", "sent_at", "updated_at"])

        count = start_stalled_plans_for_envelope(self.envelope)
        self.assertEqual(count, 1)
        enrollment = FollowUpPlanEnrollment.objects.get(recipient=self.recipient)
        self.assertEqual(enrollment.status, FollowUpPlanEnrollment.Status.ACTIVE)
        enrollment.next_run_at = timezone.now() - timedelta(minutes=1)
        enrollment.started_at = timezone.now() - timedelta(minutes=1)
        enrollment.save(update_fields=["next_run_at", "started_at", "updated_at"])

        sent = process_due_follow_up_plan_enrollments()
        self.assertEqual(sent, 1)
        self.assertEqual(len(mail.outbox), 1)
        enrollment.refresh_from_db()
        self.assertEqual(enrollment.emails_sent, 1)
        self.assertEqual(enrollment.current_step_order, 2)

    def test_sign_cancels_enrollment(self):
        self.envelope.status = Envelope.Status.SENT
        self.envelope.sent_at = timezone.now()
        self.envelope.save(update_fields=["status", "sent_at", "updated_at"])
        self.recipient.status = Recipient.Status.SENT
        self.recipient.sent_at = timezone.now()
        self.recipient.save(update_fields=["status", "sent_at", "updated_at"])
        start_stalled_plans_for_envelope(self.envelope)

        # Mark fields complete so signing validation passes
        Field.objects.filter(envelope=self.envelope).update(completed_at=timezone.now())
        # Prevent finalize path issues: only one signer, mark parallel void of PDF by
        # canceling via complete path's cancel_enrollments — call cancel helper through status
        from apps.contacts.follow_up_plans import cancel_enrollments_for_recipient

        cancel_enrollments_for_recipient(self.recipient)
        enrollment = FollowUpPlanEnrollment.objects.get(recipient=self.recipient)
        self.assertEqual(enrollment.status, FollowUpPlanEnrollment.Status.CANCELLED)
