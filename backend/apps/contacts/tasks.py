from celery import shared_task
from django.utils import timezone

from apps.contacts.models import FollowUpTask
from apps.contacts.follow_up_plans import process_due_follow_up_plan_enrollments


@shared_task
def process_due_follow_ups():
    """Count open due follow-up tasks (queue is shown in the CRM UI)."""
    return FollowUpTask.objects.filter(
        status=FollowUpTask.Status.OPEN,
        due_at__lte=timezone.now(),
    ).count()


@shared_task
def process_follow_up_plan_enrollments():
    return process_due_follow_up_plan_enrollments()


@shared_task
def process_cadence_enrollments():
    """Legacy alias — Cadences were renamed to Follow-up plans."""
    return process_due_follow_up_plan_enrollments()
