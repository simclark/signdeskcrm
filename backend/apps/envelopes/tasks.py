from celery import shared_task
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.envelopes.models import Envelope, Recipient
from apps.envelopes.services import finalize_envelope_sync, record_audit
from apps.tenants.email_templates import EmailTemplateKey
from apps.tenants.mail import send_templated_email


def _signing_context(recipient: Recipient, sign_url: str) -> dict[str, str]:
    envelope = recipient.envelope
    message = (envelope.message or "").strip()
    return {
        "recipient_name": recipient.name,
        "tenant_name": envelope.tenant.name,
        "envelope_title": envelope.title,
        "envelope_message": message,
        "action_url": sign_url,
    }


@shared_task
def send_recipient_invite(recipient_id: int, is_reminder: bool = False):
    recipient = Recipient.objects.select_related("envelope", "tenant").get(pk=recipient_id)
    envelope = recipient.envelope
    sign_url = envelope.tenant.frontend_url(f"/sign/{recipient.access_token}")
    key = (
        EmailTemplateKey.SIGNING_REMINDER
        if is_reminder
        else EmailTemplateKey.SIGNING_INVITE
    )
    send_templated_email(
        tenant=envelope.tenant,
        key=key,
        to_email=recipient.email,
        context=_signing_context(recipient, sign_url),
        action_url=sign_url,
    )


@shared_task
def send_completion_emails(envelope_id: int):
    envelope = Envelope.objects.select_related("tenant").get(pk=envelope_id)
    for recipient in envelope.recipients.all():
        download_url = envelope.tenant.frontend_url(f"/sign/{recipient.access_token}")
        send_templated_email(
            tenant=envelope.tenant,
            key=EmailTemplateKey.COMPLETION,
            to_email=recipient.email,
            context={
                "recipient_name": recipient.name,
                "tenant_name": envelope.tenant.name,
                "envelope_title": envelope.title,
                "action_url": download_url,
            },
            action_url=download_url,
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
        send_recipient_invite.delay(recipient.id, is_reminder=True)
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
