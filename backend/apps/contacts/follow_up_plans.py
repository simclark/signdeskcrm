"""Envelope-aware follow-up plan enrollment and processing."""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.utils import timezone

from apps.contacts.models import Activity, FollowUpPlan, FollowUpPlanEnrollment, FollowUpPlanStep, FollowUpTask
from apps.envelopes.models import Envelope, Recipient
from apps.tenants.mail import apply_placeholders


def _first_step(plan: FollowUpPlan) -> FollowUpPlanStep | None:
    return plan.steps.order_by("order", "id").first()


def _resolve_plan_for_trigger(
    tenant, trigger: str, preferred: FollowUpPlan | None = None
) -> FollowUpPlan | None:
    if (
        preferred
        and preferred.tenant_id == tenant.id
        and preferred.is_active
        and not preferred.is_archived
        and preferred.trigger == trigger
    ):
        return preferred
    return (
        FollowUpPlan.objects.for_tenant(tenant)
        .filter(is_archived=False, is_active=True, trigger=trigger)
        .order_by("name", "id")
        .first()
    )


@transaction.atomic
def start_plan_for_recipient(
    envelope: Envelope,
    recipient: Recipient,
    plan: FollowUpPlan,
    *,
    started_at=None,
) -> FollowUpPlanEnrollment | None:
    if not plan or not plan.is_active or plan.is_archived:
        return None
    first = _first_step(plan)
    if not first:
        return None

    start = started_at or timezone.now()
    next_run = start + timedelta(days=first.offset_days)

    enrollment = (
        FollowUpPlanEnrollment.objects.for_tenant(envelope.tenant)
        .filter(
            plan=plan,
            recipient=recipient,
            status=FollowUpPlanEnrollment.Status.ACTIVE,
        )
        .first()
    )
    if enrollment:
        enrollment.envelope = envelope
        enrollment.contact = recipient.contact
        enrollment.started_at = start
        enrollment.current_step_order = first.order
        enrollment.next_run_at = next_run
        enrollment.emails_sent = 0
        enrollment.save(
            update_fields=[
                "envelope",
                "contact",
                "started_at",
                "current_step_order",
                "next_run_at",
                "emails_sent",
                "updated_at",
            ]
        )
        return enrollment

    return FollowUpPlanEnrollment.objects.create(
        tenant=envelope.tenant,
        plan=plan,
        envelope=envelope,
        recipient=recipient,
        contact=recipient.contact,
        status=FollowUpPlanEnrollment.Status.ACTIVE,
        current_step_order=first.order,
        started_at=start,
        next_run_at=next_run,
    )


def start_stalled_plans_for_envelope(envelope: Envelope) -> int:
    plan = envelope.follow_up_plan
    if not plan or plan.trigger != FollowUpPlan.Trigger.STALLED:
        return 0
    if not plan.is_active or plan.is_archived:
        return 0

    created = 0
    idle = timedelta(hours=max(int(plan.idle_hours or 0), 0))
    now = timezone.now()
    for recipient in envelope.recipients.filter(role=Recipient.Role.SIGNER):
        if recipient.status in (
            Recipient.Status.SIGNED,
            Recipient.Status.NOT_REQUIRED,
            Recipient.Status.DECLINED,
            Recipient.Status.PENDING,
        ):
            continue
        base = recipient.sent_at or envelope.sent_at or now
        started_at = base + idle
        if start_plan_for_recipient(envelope, recipient, plan, started_at=started_at):
            created += 1
    return created


def start_declined_plan_for_recipient(recipient: Recipient) -> FollowUpPlanEnrollment | None:
    envelope = recipient.envelope
    plan = _resolve_plan_for_trigger(
        envelope.tenant,
        FollowUpPlan.Trigger.DECLINED,
        preferred=envelope.follow_up_plan,
    )
    if not plan:
        return None
    cancel_enrollments_for_recipient(recipient)
    return start_plan_for_recipient(
        envelope, recipient, plan, started_at=timezone.now()
    )


def start_completed_plans_for_envelope(envelope: Envelope) -> int:
    plan = _resolve_plan_for_trigger(
        envelope.tenant,
        FollowUpPlan.Trigger.COMPLETED,
        preferred=envelope.follow_up_plan,
    )
    if not plan:
        return 0
    started = 0
    now = timezone.now()
    for recipient in envelope.recipients.filter(role=Recipient.Role.SIGNER):
        if start_plan_for_recipient(envelope, recipient, plan, started_at=now):
            started += 1
    return started


def cancel_enrollments_for_recipient(recipient: Recipient) -> int:
    qs = FollowUpPlanEnrollment.objects.filter(
        recipient=recipient,
        status=FollowUpPlanEnrollment.Status.ACTIVE,
    )
    updated = qs.update(
        status=FollowUpPlanEnrollment.Status.CANCELLED,
        next_run_at=None,
        updated_at=timezone.now(),
    )
    return updated


def _placeholder_context(enrollment: FollowUpPlanEnrollment) -> dict[str, str]:
    recipient = enrollment.recipient
    envelope = enrollment.envelope
    contact = enrollment.contact
    sign_link = ""
    listing_address = ""
    recipient_name = ""
    envelope_title = ""
    if recipient:
        recipient_name = recipient.name or ""
        if envelope and recipient.access_token:
            sign_link = envelope.tenant.frontend_url(f"/sign/{recipient.access_token}")
    if envelope:
        envelope_title = envelope.title or ""
        if envelope.listing_id and envelope.listing_id:
            listing = getattr(envelope, "listing", None)
            if listing is None and envelope.listing_id:
                from apps.contacts.models import Listing

                listing = Listing.objects.filter(pk=envelope.listing_id).first()
            if listing:
                listing_address = listing.full_address or ""
    return {
        "recipient_name": recipient_name,
        "envelope_title": envelope_title,
        "sign_link": sign_link,
        "listing_address": listing_address,
        "contact_full_name": contact.full_name if contact else recipient_name,
        "contact_first_name": contact.first_name if contact else (recipient_name.split() or [""])[0],
        "contact_email": (contact.email if contact else (recipient.email if recipient else "")),
    }


def _complete_enrollment(enrollment: FollowUpPlanEnrollment, now) -> None:
    enrollment.status = FollowUpPlanEnrollment.Status.COMPLETED
    enrollment.completed_at = now
    enrollment.next_run_at = None
    enrollment.save(
        update_fields=["status", "completed_at", "next_run_at", "updated_at"]
    )


def _maybe_create_handoff(enrollment: FollowUpPlanEnrollment, now) -> None:
    plan = enrollment.plan
    contact = enrollment.contact
    if not plan.create_agent_handoff or not contact:
        return
    title = (plan.handoff_title or "Call signer — stalled packet").strip()[:255]
    task = FollowUpTask.objects.create(
        tenant=enrollment.tenant,
        contact=contact,
        title=title,
        due_at=now,
        notes=f"Auto-created after follow-up plan '{plan.name}' finished.",
    )
    if contact.next_follow_up_at is None or task.due_at < contact.next_follow_up_at:
        contact.next_follow_up_at = task.due_at
        contact.save(update_fields=["next_follow_up_at", "updated_at"])
    Activity.objects.create(
        tenant=enrollment.tenant,
        contact=contact,
        company=contact.company,
        kind=Activity.Kind.FOLLOW_UP,
        message=f"Follow-up created from plan: {title}",
        metadata={
            "follow_up_task_id": task.id,
            "plan_id": plan.id,
            "enrollment_id": enrollment.id,
        },
    )


def process_due_follow_up_plan_enrollments() -> int:
    now = timezone.now()
    due = (
        FollowUpPlanEnrollment.objects.filter(
            status=FollowUpPlanEnrollment.Status.ACTIVE,
            next_run_at__isnull=False,
            next_run_at__lte=now,
        )
        .select_related(
            "plan",
            "contact",
            "contact__company",
            "recipient",
            "envelope",
            "envelope__listing",
            "envelope__tenant",
            "tenant",
        )
    )
    sent = 0
    for enrollment in due:
        plan = enrollment.plan
        recipient = enrollment.recipient
        envelope = enrollment.envelope

        if not plan.is_active or plan.is_archived:
            enrollment.status = FollowUpPlanEnrollment.Status.CANCELLED
            enrollment.next_run_at = None
            enrollment.save(update_fields=["status", "next_run_at", "updated_at"])
            continue

        if envelope and envelope.status in (
            Envelope.Status.VOIDED,
            Envelope.Status.EXPIRED,
        ):
            enrollment.status = FollowUpPlanEnrollment.Status.CANCELLED
            enrollment.next_run_at = None
            enrollment.save(update_fields=["status", "next_run_at", "updated_at"])
            continue

        if plan.trigger == FollowUpPlan.Trigger.STALLED:
            if not recipient or not envelope:
                enrollment.status = FollowUpPlanEnrollment.Status.CANCELLED
                enrollment.next_run_at = None
                enrollment.save(update_fields=["status", "next_run_at", "updated_at"])
                continue
            if recipient.status in (
                Recipient.Status.SIGNED,
                Recipient.Status.NOT_REQUIRED,
                Recipient.Status.DECLINED,
            ):
                cancel_enrollments_for_recipient(recipient)
                continue
            if envelope.status not in (
                Envelope.Status.SENT,
                Envelope.Status.IN_PROGRESS,
            ):
                enrollment.status = FollowUpPlanEnrollment.Status.CANCELLED
                enrollment.next_run_at = None
                enrollment.save(update_fields=["status", "next_run_at", "updated_at"])
                continue

        step = FollowUpPlanStep.objects.filter(
            plan=plan, order=enrollment.current_step_order
        ).first()
        if not step:
            _complete_enrollment(enrollment, now)
            _maybe_create_handoff(enrollment, now)
            continue

        to_email = (
            recipient.email
            if recipient
            else (enrollment.contact.email if enrollment.contact else "")
        )
        if not to_email:
            continue

        placeholders = _placeholder_context(enrollment)
        subject = apply_placeholders(step.subject, placeholders)
        body = apply_placeholders(step.body, placeholders)
        try:
            msg = EmailMultiAlternatives(
                subject=subject or "Follow-up",
                body=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[to_email],
            )
            msg.send(fail_silently=False)
        except Exception:
            continue

        enrollment.emails_sent = (enrollment.emails_sent or 0) + 1
        enrollment.save(update_fields=["emails_sent", "updated_at"])

        if enrollment.contact_id:
            Activity.objects.create(
                tenant=enrollment.tenant,
                contact=enrollment.contact,
                company=enrollment.contact.company,
                kind=Activity.Kind.PLAN_EMAIL,
                message=f"Follow-up plan email sent: {subject}",
                metadata={
                    "plan_id": plan.id,
                    "enrollment_id": enrollment.id,
                    "step_order": step.order,
                    "envelope_id": enrollment.envelope_id,
                    "recipient_id": enrollment.recipient_id,
                },
            )
        sent += 1

        next_step = (
            FollowUpPlanStep.objects.filter(plan=plan, order__gt=step.order)
            .order_by("order")
            .first()
        )
        started = enrollment.started_at or now
        if next_step:
            enrollment.current_step_order = next_step.order
            enrollment.next_run_at = started + timedelta(days=next_step.offset_days)
            enrollment.save(
                update_fields=["current_step_order", "next_run_at", "updated_at"]
            )
        else:
            _complete_enrollment(enrollment, now)
            _maybe_create_handoff(enrollment, now)

    return sent
