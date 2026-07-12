from __future__ import annotations

import hashlib
import io
from datetime import timedelta

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from apps.audit.models import AuditEvent
from apps.contacts.models import Activity
from apps.envelopes.models import Envelope, Field, Recipient


CONSENT_VERSION = "2026-01"


def client_meta(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    ip = xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR")
    return {
        "ip_address": ip,
        "user_agent": request.META.get("HTTP_USER_AGENT", "")[:1000],
    }


def record_audit(
    *,
    tenant,
    envelope,
    event_type,
    recipient=None,
    actor_email="",
    actor_name="",
    ip_address=None,
    user_agent="",
    consent_version="",
    payload=None,
):
    return AuditEvent.objects.create(
        tenant=tenant,
        envelope=envelope,
        recipient=recipient,
        event_type=event_type,
        actor_email=actor_email,
        actor_name=actor_name,
        ip_address=ip_address,
        user_agent=user_agent,
        consent_version=consent_version,
        payload=payload or {},
    )


def validate_envelope_for_send(envelope: Envelope) -> list[str]:
    errors = []
    signers = list(envelope.recipients.filter(role=Recipient.Role.SIGNER))
    if not signers:
        errors.append("Add at least one signer.")
    for signer in signers:
        sig_fields = envelope.fields.filter(
            recipient=signer, field_type=Field.FieldType.SIGNATURE
        )
        if not sig_fields.exists():
            errors.append(f"Signer {signer.email} needs at least one signature field.")
    if not envelope.document_version_id:
        version = envelope.document.current_version
        if not version:
            errors.append("Document has no uploaded PDF version.")
        else:
            envelope.document_version = version
            envelope.save(update_fields=["document_version"])
    return errors


@transaction.atomic
def send_envelope(envelope: Envelope, request=None):
    errors = validate_envelope_for_send(envelope)
    if errors:
        raise ValueError("; ".join(errors))

    version = envelope.document_version or envelope.document.current_version
    envelope.document_version = version
    envelope.pre_sign_sha256 = version.sha256
    envelope.status = Envelope.Status.SENT
    envelope.sent_at = timezone.now()
    days = envelope.tenant.default_expiration_days
    envelope.expires_at = timezone.now() + timedelta(days=days)
    envelope.save()

    meta = client_meta(request) if request else {}
    record_audit(
        tenant=envelope.tenant,
        envelope=envelope,
        event_type=AuditEvent.EventType.SENT,
        actor_email=getattr(getattr(request, "user", None), "email", ""),
        actor_name=getattr(getattr(request, "user", None), "full_name", ""),
        payload={"recipient_count": envelope.recipients.count()},
        **meta,
    )

    if envelope.routing == Envelope.Routing.SEQUENTIAL:
        first_order = (
            envelope.recipients.filter(role=Recipient.Role.SIGNER)
            .order_by("routing_order")
            .values_list("routing_order", flat=True)
            .first()
        )
        to_notify = envelope.recipients.filter(
            role=Recipient.Role.SIGNER, routing_order=first_order
        )
    else:
        to_notify = envelope.recipients.filter(role=Recipient.Role.SIGNER)

    from apps.envelopes.tasks import send_recipient_invite

    for recipient in to_notify:
        recipient.status = Recipient.Status.SENT
        recipient.sent_at = timezone.now()
        recipient.save(update_fields=["status", "sent_at", "updated_at"])
        if recipient.contact_id:
            Activity.objects.create(
                tenant=envelope.tenant,
                contact=recipient.contact,
                company=recipient.contact.company,
                kind=Activity.Kind.ENVELOPE_SENT,
                message=f"Envelope '{envelope.title}' sent",
                metadata={"envelope_id": envelope.id},
            )
        send_recipient_invite.delay(recipient.id)

    # CC recipients get a copy-on-send notice
    for recipient in envelope.recipients.filter(role=Recipient.Role.CC):
        send_recipient_invite.delay(recipient.id)

    return envelope


def mark_viewed(recipient: Recipient, request):
    if recipient.status in (Recipient.Status.PENDING, Recipient.Status.SENT):
        recipient.status = Recipient.Status.VIEWED
        recipient.viewed_at = timezone.now()
        recipient.save(update_fields=["status", "viewed_at", "updated_at"])
    meta = client_meta(request)
    record_audit(
        tenant=recipient.tenant,
        envelope=recipient.envelope,
        event_type=AuditEvent.EventType.VIEWED,
        recipient=recipient,
        actor_email=recipient.email,
        actor_name=recipient.name,
        **meta,
    )
    envelope = recipient.envelope
    if envelope.status == Envelope.Status.SENT:
        envelope.status = Envelope.Status.IN_PROGRESS
        envelope.save(update_fields=["status", "updated_at"])


def accept_consent(recipient: Recipient, request):
    meta = client_meta(request)
    record_audit(
        tenant=recipient.tenant,
        envelope=recipient.envelope,
        event_type=AuditEvent.EventType.CONSENT_ACCEPTED,
        recipient=recipient,
        actor_email=recipient.email,
        actor_name=recipient.name,
        consent_version=CONSENT_VERSION,
        payload={"consent_version": CONSENT_VERSION},
        **meta,
    )


@transaction.atomic
def complete_recipient_signing(recipient: Recipient, request=None):
    required = recipient.fields.filter(required=True)
    incomplete = required.filter(completed_at__isnull=True)
    if incomplete.exists():
        raise ValueError("Complete all required fields before submitting.")

    recipient.status = Recipient.Status.SIGNED
    recipient.signed_at = timezone.now()
    recipient.save(update_fields=["status", "signed_at", "updated_at"])

    meta = client_meta(request) if request else {}
    record_audit(
        tenant=recipient.tenant,
        envelope=recipient.envelope,
        event_type=AuditEvent.EventType.SIGNED,
        recipient=recipient,
        actor_email=recipient.email,
        actor_name=recipient.name,
        **meta,
    )

    if recipient.contact_id:
        Activity.objects.create(
            tenant=recipient.tenant,
            contact=recipient.contact,
            company=recipient.contact.company,
            kind=Activity.Kind.ENVELOPE_SIGNED,
            message=f"{recipient.name} signed '{recipient.envelope.title}'",
            metadata={"envelope_id": recipient.envelope_id},
        )

    envelope = recipient.envelope
    signers = envelope.recipients.filter(role=Recipient.Role.SIGNER)
    if signers.exclude(status=Recipient.Status.SIGNED).exists():
        # Notify next sequential signer
        if envelope.routing == Envelope.Routing.SEQUENTIAL:
            next_signer = (
                signers.filter(status=Recipient.Status.PENDING)
                .order_by("routing_order")
                .first()
            )
            if next_signer:
                from apps.envelopes.tasks import send_recipient_invite

                next_signer.status = Recipient.Status.SENT
                next_signer.sent_at = timezone.now()
                next_signer.save(update_fields=["status", "sent_at", "updated_at"])
                send_recipient_invite.delay(next_signer.id)
        return envelope

    # All signers done — flatten PDF and complete
    from apps.envelopes.tasks import finalize_envelope

    finalize_envelope.delay(envelope.id)
    return envelope


def _page_size(reader, page_index: int):
    page = reader.pages[page_index]
    box = page.mediabox
    return float(box.width), float(box.height)


def flatten_envelope_pdf(envelope: Envelope) -> bytes:
    version = envelope.document_version
    reader = PdfReader(version.file.path)
    writer = PdfWriter()

    fields = list(envelope.fields.select_related("recipient"))
    for page_index in range(len(reader.pages)):
        page = reader.pages[page_index]
        page_fields = [f for f in fields if f.page == page_index + 1]
        if not page_fields:
            writer.add_page(page)
            continue

        width, height = _page_size(reader, page_index)
        packet = io.BytesIO()
        c = canvas.Canvas(packet, pagesize=(width, height))
        for field in page_fields:
            x = field.x * width
            y = field.y * height
            w = field.w * width
            h = field.h * height
            if field.field_type in (
                Field.FieldType.SIGNATURE,
                Field.FieldType.INITIALS,
            ):
                if field.value.startswith("data:image") or field.value.startswith("/"):
                    # value may be media path or we store image path in value
                    try:
                        from django.conf import settings
                        import os

                        path = field.value
                        if path.startswith(settings.MEDIA_URL):
                            path = os.path.join(
                                settings.MEDIA_ROOT, path[len(settings.MEDIA_URL) :]
                            )
                        if os.path.exists(path):
                            img = ImageReader(path)
                            c.drawImage(
                                img, x, y, width=w, height=h, mask="auto", preserveAspectRatio=True
                            )
                    except Exception:
                        c.setFont("Helvetica-Oblique", max(8, h * 0.4))
                        c.drawString(x + 2, y + h / 3, field.recipient.name)
                else:
                    c.setFont("Helvetica-Oblique", max(8, h * 0.45))
                    c.drawString(x + 2, y + h / 3, field.value or field.recipient.name)
            elif field.field_type == Field.FieldType.CHECKBOX:
                c.rect(x, y, min(w, h), min(w, h))
                if field.value.lower() in ("1", "true", "yes", "on"):
                    c.setFont("Helvetica-Bold", min(w, h) * 0.8)
                    c.drawString(x + 1, y + 1, "X")
            else:
                c.setFont("Helvetica", max(8, h * 0.5))
                c.drawString(x + 2, y + h / 3, field.value[:200])
        c.save()
        packet.seek(0)
        overlay = PdfReader(packet)
        if overlay.pages:
            page.merge_page(overlay.pages[0])
        writer.add_page(page)

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def generate_certificate_pdf(envelope: Envelope) -> bytes:
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    y = height - 54
    c.setFont("Helvetica-Bold", 18)
    c.drawString(54, y, "Certificate of Completion")
    y -= 28
    c.setFont("Helvetica", 11)
    c.drawString(54, y, f"Envelope: {envelope.title}")
    y -= 16
    c.drawString(54, y, f"Envelope ID: {envelope.id}")
    y -= 16
    c.drawString(54, y, f"Workspace: {envelope.tenant.name} ({envelope.tenant.slug})")
    y -= 16
    c.drawString(54, y, f"Completed: {envelope.completed_at or timezone.now()}")
    y -= 16
    c.drawString(54, y, f"Document hash (pre-sign): {envelope.pre_sign_sha256}")
    y -= 16
    c.drawString(54, y, f"Document hash (post-sign): {envelope.post_sign_sha256}")
    y -= 28
    c.setFont("Helvetica-Bold", 12)
    c.drawString(54, y, "Recipients")
    y -= 18
    c.setFont("Helvetica", 10)
    for r in envelope.recipients.all():
        line = f"{r.name} <{r.email}> — {r.role} — {r.status}"
        if r.signed_at:
            line += f" — signed {r.signed_at.isoformat()}"
        c.drawString(54, y, line[:110])
        y -= 14
        if y < 80:
            c.showPage()
            y = height - 54
            c.setFont("Helvetica", 10)
    y -= 12
    c.setFont("Helvetica-Bold", 12)
    c.drawString(54, y, "Audit trail")
    y -= 18
    c.setFont("Helvetica", 9)
    for event in envelope.audit_events.all():
        line = (
            f"{event.created_at.isoformat()} | {event.event_type} | "
            f"{event.actor_email} | ip={event.ip_address or '-'}"
        )
        c.drawString(54, y, line[:115])
        y -= 12
        if y < 54:
            c.showPage()
            y = height - 54
            c.setFont("Helvetica", 9)
    c.showPage()
    c.save()
    return buffer.getvalue()


@transaction.atomic
def finalize_envelope_sync(envelope_id: int):
    envelope = Envelope.objects.select_related("tenant", "document_version").get(
        pk=envelope_id
    )
    pdf_bytes = flatten_envelope_pdf(envelope)
    digest = hashlib.sha256(pdf_bytes).hexdigest()
    envelope.post_sign_sha256 = digest
    envelope.signed_file.save(
        f"envelope-{envelope.id}-signed.pdf", ContentFile(pdf_bytes), save=False
    )
    cert_bytes = generate_certificate_pdf(envelope)
    envelope.certificate_file.save(
        f"envelope-{envelope.id}-certificate.pdf", ContentFile(cert_bytes), save=False
    )
    envelope.status = Envelope.Status.COMPLETED
    envelope.completed_at = timezone.now()
    envelope.save()

    record_audit(
        tenant=envelope.tenant,
        envelope=envelope,
        event_type=AuditEvent.EventType.COMPLETED,
        payload={"post_sign_sha256": digest},
    )

    from apps.envelopes.tasks import send_completion_emails

    send_completion_emails.delay(envelope.id)
    return envelope
