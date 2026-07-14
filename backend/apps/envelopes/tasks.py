from celery import shared_task
from datetime import timedelta

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
    qs = (
        Recipient.objects.filter(
            role=Recipient.Role.SIGNER,
            status__in=[Recipient.Status.SENT, Recipient.Status.VIEWED],
            envelope__status__in=[Envelope.Status.SENT, Envelope.Status.IN_PROGRESS],
            envelope__expires_at__gt=now,
            tenant__reminders_enabled=True,
        )
        .select_related("envelope", "tenant")
    )
    for recipient in qs:
        tenant = recipient.tenant
        interval_hours = max(int(tenant.reminder_interval_hours or 48), 1)
        max_count = int(tenant.reminder_max_count or 0)
        if max_count and recipient.reminder_count >= max_count:
            continue
        last = recipient.last_reminded_at or recipient.sent_at
        if last and (now - last).total_seconds() < interval_hours * 3600:
            continue
        send_recipient_invite.delay(recipient.id, is_reminder=True)
        recipient.last_reminded_at = now
        recipient.reminder_count = (recipient.reminder_count or 0) + 1
        recipient.save(update_fields=["last_reminded_at", "reminder_count", "updated_at"])
        record_audit(
            tenant=tenant,
            envelope=recipient.envelope,
            event_type=AuditEvent.EventType.REMINDED,
            recipient=recipient,
            actor_email="system@signdeskcrm.com",
            actor_name="System",
            payload={"reminder_count": recipient.reminder_count},
        )


@shared_task
def expire_envelopes():
    """Mark sent/in-progress envelopes as expired when expires_at has passed."""
    now = timezone.now()
    qs = Envelope.objects.filter(
        status__in=[Envelope.Status.SENT, Envelope.Status.IN_PROGRESS],
        expires_at__isnull=False,
        expires_at__lte=now,
    )
    expired = 0
    for envelope in qs.iterator():
        envelope.status = Envelope.Status.EXPIRED
        envelope.save(update_fields=["status", "updated_at"])
        record_audit(
            tenant=envelope.tenant,
            envelope=envelope,
            event_type=AuditEvent.EventType.EXPIRED,
            actor_email="system@signdeskcrm.com",
            actor_name="System",
            payload={"expires_at": envelope.expires_at.isoformat() if envelope.expires_at else None},
        )
        expired += 1
    return expired


@shared_task
def purge_expired_retained_documents():
    """Remove downloadable signed PDFs/certificates past each workspace retention window."""
    now = timezone.now()
    qs = (
        Envelope.objects.filter(
            status=Envelope.Status.COMPLETED,
            retention_purged_at__isnull=True,
            completed_at__isnull=False,
            tenant__document_retention_days__isnull=False,
        )
        .select_related("tenant")
    )
    purged = 0
    for envelope in qs:
        days = envelope.tenant.document_retention_days
        if not days:
            continue
        cutoff = envelope.completed_at + timedelta(days=days)
        if cutoff > now:
            continue
        if envelope.signed_file:
            envelope.signed_file.delete(save=False)
            envelope.signed_file = None
        if envelope.certificate_file:
            envelope.certificate_file.delete(save=False)
            envelope.certificate_file = None
        envelope.retention_purged_at = now
        envelope.save(
            update_fields=[
                "signed_file",
                "certificate_file",
                "retention_purged_at",
                "updated_at",
            ]
        )
        record_audit(
            tenant=envelope.tenant,
            envelope=envelope,
            event_type=AuditEvent.EventType.RETENTION_PURGED,
            actor_email="system@signdeskcrm.com",
            actor_name="System",
            payload={"retention_days": days},
        )
        purged += 1
    return purged
