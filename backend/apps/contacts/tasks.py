from datetime import timedelta

from celery import shared_task
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.utils import timezone

from apps.contacts.models import Activity, CadenceEnrollment, CadenceStep, FollowUpTask
from apps.tenants.mail import apply_placeholders


@shared_task
def process_due_follow_ups():
    """Count open due follow-up tasks (queue is shown in the CRM UI)."""
    return FollowUpTask.objects.filter(
        status=FollowUpTask.Status.OPEN,
        due_at__lte=timezone.now(),
    ).count()


@shared_task
def process_cadence_enrollments():
    now = timezone.now()
    due = (
        CadenceEnrollment.objects.filter(
            status=CadenceEnrollment.Status.ACTIVE,
            next_run_at__isnull=False,
            next_run_at__lte=now,
        )
        .select_related("contact", "cadence", "tenant")
    )
    sent = 0
    for enrollment in due:
        step = CadenceStep.objects.filter(
            cadence=enrollment.cadence, order=enrollment.current_step_order
        ).first()
        if not step:
            enrollment.status = CadenceEnrollment.Status.COMPLETED
            enrollment.completed_at = now
            enrollment.next_run_at = None
            enrollment.save(update_fields=["status", "completed_at", "next_run_at", "updated_at"])
            continue

        contact = enrollment.contact
        placeholders = {
            "contact_full_name": contact.full_name,
            "contact_first_name": contact.first_name,
            "contact_email": contact.email,
        }
        subject = apply_placeholders(step.subject, placeholders)
        body = apply_placeholders(step.body, placeholders)
        try:
            msg = EmailMultiAlternatives(
                subject=subject or "Hello",
                body=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[contact.email],
            )
            msg.send(fail_silently=False)
        except Exception:
            continue

        Activity.objects.create(
            tenant=enrollment.tenant,
            contact=contact,
            company=contact.company,
            kind=Activity.Kind.CADENCE_EMAIL,
            message=f"Cadence email sent: {subject}",
            metadata={
                "cadence_id": enrollment.cadence_id,
                "enrollment_id": enrollment.id,
                "step_order": step.order,
            },
        )
        sent += 1

        next_step = (
            CadenceStep.objects.filter(cadence=enrollment.cadence, order__gt=step.order)
            .order_by("order")
            .first()
        )
        if next_step:
            enrollment.current_step_order = next_step.order
            enrollment.next_run_at = now + timedelta(days=next_step.offset_days)
            enrollment.save(
                update_fields=["current_step_order", "next_run_at", "updated_at"]
            )
            if (
                contact.next_follow_up_at is None
                or enrollment.next_run_at < contact.next_follow_up_at
            ):
                contact.next_follow_up_at = enrollment.next_run_at
                contact.save(update_fields=["next_follow_up_at", "updated_at"])
        else:
            enrollment.status = CadenceEnrollment.Status.COMPLETED
            enrollment.completed_at = now
            enrollment.next_run_at = None
            enrollment.save(
                update_fields=["status", "completed_at", "next_run_at", "updated_at"]
            )
    return sent
