from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.envelopes.models import Envelope, Recipient
from apps.envelopes.services import finalize_envelope_sync, record_audit


@shared_task
def send_recipient_invite(recipient_id: int):
    recipient = Recipient.objects.select_related("envelope", "tenant").get(pk=recipient_id)
    envelope = recipient.envelope
    sign_url = envelope.tenant.frontend_url(f"/sign/{recipient.access_token}")
    subject = f"Please sign: {envelope.title}"
    body = (
        f"Hello {recipient.name},\n\n"
        f"{envelope.tenant.name} has sent you a document to sign: {envelope.title}.\n\n"
        f"{envelope.message}\n\n"
        f"Sign here: {sign_url}\n\n"
        f"— SignDesk\n"
    )
    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [recipient.email], fail_silently=False)


@shared_task
def send_completion_emails(envelope_id: int):
    envelope = Envelope.objects.select_related("tenant").get(pk=envelope_id)
    download_note = (
        f"The signed document is available in the {envelope.tenant.name} workspace."
    )
    for recipient in envelope.recipients.all():
        subject = f"Completed: {envelope.title}"
        body = (
            f"Hello {recipient.name},\n\n"
            f"The document '{envelope.title}' has been completed.\n"
            f"{download_note}\n\n"
            f"— SignDesk\n"
        )
        send_mail(
            subject, body, settings.DEFAULT_FROM_EMAIL, [recipient.email], fail_silently=False
        )


@shared_task
def finalize_envelope(envelope_id: int):
    return finalize_envelope_sync(envelope_id).id


@shared_task
def send_due_reminders():
    now = timezone.now()
    qs = Recipient.objects.filter(
        role=Recipient.Role.SIGNER,
        status__in=[Recipient.Status.SENT, Recipient.Status.VIEWED],
        envelope__status__in=[Envelope.Status.SENT, Envelope.Status.IN_PROGRESS],
        envelope__expires_at__gt=now,
    ).select_related("envelope", "tenant")
    for recipient in qs:
        last = recipient.last_reminded_at or recipient.sent_at
        if last and (now - last).total_seconds() < 48 * 3600:
            continue
        send_recipient_invite.delay(recipient.id)
        recipient.last_reminded_at = now
        recipient.save(update_fields=["last_reminded_at", "updated_at"])
        record_audit(
            tenant=recipient.tenant,
            envelope=recipient.envelope,
            event_type=AuditEvent.EventType.REMINDED,
            recipient=recipient,
            actor_email="system@signdeskcrm.com",
            actor_name="System",
        )
