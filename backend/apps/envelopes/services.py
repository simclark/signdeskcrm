from __future__ import annotations

import hashlib
import io
import os
import re
from datetime import timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from apps.audit.models import AuditEvent
from apps.contacts.models import Activity
from apps.envelopes.models import Envelope, Field, Recipient, SignatureAsset
from apps.tenants.esign_disclosure import (
    DEFAULT_ESIGN_ACKNOWLEDGEMENT_VERSION,
    resolve_acknowledgement,
    sha256_text,
)


CONSENT_VERSION = DEFAULT_ESIGN_ACKNOWLEDGEMENT_VERSION
BRAND_GREEN = colors.HexColor("#0b6e4f")
MUTED_GRAY = colors.HexColor("#5c6570")
RULE_GRAY = colors.HexColor("#d8dde3")
LIGHT_BAND = colors.HexColor("#f4f7f5")

_COPY_SUFFIX_RE = re.compile(r"(?:\s*\(copy(?:\s+\d+)?\))+$", re.IGNORECASE)
_COPY_PART_RE = re.compile(r"\(copy(?:\s+(\d+))?\)", re.IGNORECASE)


def _tenant_zoneinfo(tenant) -> ZoneInfo:
    name = (getattr(tenant, "timezone", None) or "UTC").strip() or "UTC"
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _tenant_brand_color(tenant) -> colors.Color:
    raw = (getattr(tenant, "accent_color", None) or "#0b6e4f").strip()
    if not raw.startswith("#"):
        raw = f"#{raw}"
    try:
        return colors.HexColor(raw)
    except Exception:
        return BRAND_GREEN


def _format_cert_datetime(value, tenant=None) -> str:
    if not value:
        return "—"
    if timezone.is_aware(value):
        if tenant is not None:
            value = value.astimezone(_tenant_zoneinfo(tenant))
        else:
            value = timezone.localtime(value)
    return value.strftime("%b %d, %Y · %I:%M:%S %p %Z")


def next_copy_title(title: str) -> str:
    """Build a copy title without stacking repeated "(copy)" suffixes.

    Examples:
      "Agreement" → "Agreement (copy)"
      "Agreement (copy)" → "Agreement (copy 2)"
      "Agreement (copy 2)" → "Agreement (copy 3)"
      "Agreement (copy) (copy)" → "Agreement (copy 3)"
    """
    title = (title or "").strip() or "Untitled"
    match = _COPY_SUFFIX_RE.search(title)
    if not match:
        return f"{title} (copy)"

    base = title[: match.start()].rstrip() or "Untitled"
    numbers = [
        int(part.group(1)) if part.group(1) else 1
        for part in _COPY_PART_RE.finditer(match.group(0))
    ]
    if len(numbers) > 1 and all(n == 1 for n in numbers):
        next_n = len(numbers) + 1
    else:
        next_n = max(numbers, default=1) + 1
    return f"{base} (copy {next_n})"


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


def resolve_merge_values_for_envelope(
    envelope: Envelope,
    contact=None,
    *,
    overwrite_with_empty: bool = False,
) -> int:
    """Resolve merge tokens onto field values. Returns count of fields updated.

    When ``overwrite_with_empty`` is False (send path), empty resolutions leave
    existing manual values in place.
    """
    from apps.documents.merge import build_merge_context, resolve_merge_token

    if contact is None:
        for recipient in envelope.recipients.all():
            if recipient.contact_id:
                contact = recipient.contact
                break

    ctx = build_merge_context(
        contact=contact,
        company=getattr(contact, "company", None) if contact else None,
        listing=envelope.listing,
        deal=envelope.merge_data,
        recipients=list(envelope.recipients.all()),
    )
    updated = 0
    for field in envelope.fields.all():
        token = (field.merge_token or "").strip()
        if not token:
            label = field.label or ""
            if label.startswith("{{") and label.endswith("}}"):
                token = label[2:-2].strip()
        if not token:
            continue
        value = resolve_merge_token(token, ctx)
        if not value and not overwrite_with_empty:
            continue
        if value != field.value:
            field.value = value
            field.save(update_fields=["value"])
            updated += 1
    return updated


def validate_envelope_for_send(envelope: Envelope) -> list[str]:
    errors = []
    signers = list(envelope.recipients.filter(role=Recipient.Role.SIGNER))
    if not signers:
        errors.append("Add at least one signer.")
    for signer in signers:
        has_signer_fields = envelope.fields.filter(
            recipient=signer, fill_mode=Field.FillMode.SIGNER
        ).exists()
        if not has_signer_fields:
            # Document-data assignee only — no signing tasks
            continue
        sig_fields = envelope.fields.filter(
            recipient=signer, field_type=Field.FieldType.SIGNATURE
        )
        if not sig_fields.exists():
            errors.append(f"Signer {signer.email} needs at least one signature field.")

    active_signers = [
        s
        for s in signers
        if envelope.fields.filter(recipient=s, fill_mode=Field.FillMode.SIGNER).exists()
    ]
    if not active_signers:
        errors.append("Add at least one signer with fields to complete.")
    for field in envelope.fields.filter(fill_mode=Field.FillMode.DOCUMENT, required=True):
        if not (field.value or "").strip():
            label = field.label or field.merge_token or field.field_type
            errors.append(f"Document field '{label}' needs a value before send.")
    if not envelope.document_version_id:
        version = envelope.document.current_version
        if not version:
            errors.append("Document has no uploaded PDF version.")
        else:
            envelope.document_version = version
            envelope.save(update_fields=["document_version"])
    return errors


def _overlay_fields_on_pdf(version, fields) -> bytes:
    """Draw the given fields onto a copy of the PDF version and return bytes."""
    reader = PdfReader(version.file.path)
    writer = PdfWriter()
    fields = list(fields)

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
                path = _resolve_image_path(field.value)
                if path:
                    try:
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
                c.drawString(x + 2, y + h / 3, (field.value or "")[:200])
        c.save()
        packet.seek(0)
        overlay = PdfReader(packet)
        if overlay.pages:
            page.merge_page(overlay.pages[0])
        writer.add_page(page)

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def stamp_document_fields_pdf(envelope: Envelope) -> bytes | None:
    """Overlay document-fill fields onto the current PDF. None if nothing to stamp."""
    fields = [
        f
        for f in envelope.fields.select_related("recipient").all()
        if f.fill_mode == Field.FillMode.DOCUMENT and (f.value or "").strip()
    ]
    if not fields:
        return None
    version = envelope.document_version or envelope.document.current_version
    if not version:
        return None
    return _overlay_fields_on_pdf(version, fields)


def create_stamped_document_version(envelope: Envelope, pdf_bytes: bytes):
    """Persist stamped PDF on an envelope-private Document copy (never on library docs).

    Writing a new version onto ``envelope.document`` would make stamped bytes the
    shared ``current_version`` and pollute templates that reuse that PDF.
    """
    from apps.documents.models import Document, DocumentVersion

    source_document = envelope.document
    base = envelope.document_version or source_document.current_version
    stamped_doc = Document.objects.create(
        tenant=envelope.tenant,
        title=f"{envelope.title} (stamped)"[:255],
        original_filename=f"envelope-{envelope.id}-stamped.pdf",
        created_by=envelope.created_by,
    )
    stamped = DocumentVersion(
        tenant=envelope.tenant,
        document=stamped_doc,
        version_number=1,
        page_count=base.page_count if base else 1,
    )
    stamped.file.save(
        f"envelope-{envelope.id}-stamped.pdf",
        ContentFile(pdf_bytes),
        save=False,
    )
    stamped.save()
    stamped.compute_hash()
    stamped.save(update_fields=["sha256", "byte_size"])
    return stamped


@transaction.atomic
def send_envelope(envelope: Envelope, request=None):
    # Refresh document-field values from merge context before validation/stamp
    resolve_merge_values_for_envelope(envelope)
    envelope.refresh_from_db()

    errors = validate_envelope_for_send(envelope)
    if errors:
        raise ValueError("; ".join(errors))

    version = envelope.document_version or envelope.document.current_version
    stamped_bytes = stamp_document_fields_pdf(envelope)
    if stamped_bytes:
        version = create_stamped_document_version(envelope, stamped_bytes)
        # Point the envelope at the private stamped document (leave library PDF alone)
        envelope.document = version.document
        now = timezone.now()
        envelope.fields.filter(fill_mode=Field.FillMode.DOCUMENT).update(
            completed_at=now
        )

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

    def _has_signer_tasks(recipient_id: int) -> bool:
        return envelope.fields.filter(
            recipient_id=recipient_id, fill_mode=Field.FillMode.SIGNER
        ).exists()

    signer_qs = envelope.recipients.filter(role=Recipient.Role.SIGNER)
    active_ids = [
        r.id for r in signer_qs if _has_signer_tasks(r.id)
    ]
    if envelope.routing == Envelope.Routing.SEQUENTIAL:
        first_order = (
            signer_qs.filter(id__in=active_ids)
            .order_by("routing_order")
            .values_list("routing_order", flat=True)
            .first()
        )
        to_notify = signer_qs.filter(id__in=active_ids, routing_order=first_order)
    else:
        to_notify = signer_qs.filter(id__in=active_ids)

    # Document-only assignees: mark signed so they don't block completion
    for recipient in signer_qs.exclude(id__in=active_ids):
        recipient.status = Recipient.Status.SIGNED
        recipient.signed_at = timezone.now()
        recipient.save(update_fields=["status", "signed_at", "updated_at"])

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
    """Record affirmative ESIGN/UETA consent with an immutable text snapshot."""
    if recipient.consented_at:
        return recipient

    meta = client_meta(request)
    text, version = resolve_acknowledgement(recipient.tenant)
    text_hash = sha256_text(text)
    now = timezone.now()

    recipient.consented_at = now
    recipient.consent_version = version
    recipient.consent_text = text
    recipient.consent_text_sha256 = text_hash
    recipient.consent_ip = meta.get("ip_address")
    recipient.consent_user_agent = (meta.get("user_agent") or "")[:2000]
    recipient.save(
        update_fields=[
            "consented_at",
            "consent_version",
            "consent_text",
            "consent_text_sha256",
            "consent_ip",
            "consent_user_agent",
            "updated_at",
        ]
    )

    record_audit(
        tenant=recipient.tenant,
        envelope=recipient.envelope,
        event_type=AuditEvent.EventType.CONSENT_ACCEPTED,
        recipient=recipient,
        actor_email=recipient.email,
        actor_name=recipient.name,
        consent_version=version,
        payload={
            "consent_version": version,
            "consent_text_sha256": text_hash,
        },
        **meta,
    )
    return recipient


def require_consent(recipient: Recipient) -> None:
    """Raise PermissionError if the recipient has not accepted the disclosure."""
    if not recipient.consented_at:
        raise PermissionError(
            "You must accept the electronic records and signatures disclosure "
            "before continuing."
        )


def require_signer_turn(recipient: Recipient) -> None:
    """Raise PermissionError if sequential routing and this signer is not yet invited."""
    if recipient.role != Recipient.Role.SIGNER:
        return
    envelope = recipient.envelope
    if envelope.routing != Envelope.Routing.SEQUENTIAL:
        return
    if envelope.status in (
        Envelope.Status.COMPLETED,
        Envelope.Status.VOIDED,
        Envelope.Status.EXPIRED,
        Envelope.Status.DECLINED,
        Envelope.Status.DRAFT,
    ):
        return
    if recipient.status == Recipient.Status.PENDING:
        raise PermissionError(
            "It is not your turn to sign yet. You will receive an email when "
            "the previous signer finishes."
        )


@transaction.atomic
def complete_recipient_signing(recipient: Recipient, request=None):
    required = recipient.fields.filter(
        required=True, fill_mode=Field.FillMode.SIGNER
    )
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
    """Final flatten: signer fields only (document data already stamped on send)."""
    version = envelope.document_version
    fields = [
        f
        for f in envelope.fields.select_related("recipient").all()
        if f.fill_mode != Field.FillMode.DOCUMENT
    ]
    return _overlay_fields_on_pdf(version, fields)


def _resolve_image_path(value: str | None) -> str | None:
    """Resolve a Field.value or media path to a readable filesystem path."""
    if not value:
        return None
    path = value
    if path.startswith("data:image"):
        return None
    media_url = settings.MEDIA_URL or "/media/"
    if path.startswith(media_url):
        path = os.path.join(settings.MEDIA_ROOT, path[len(media_url) :])
    elif path.startswith("/media/"):
        path = os.path.join(settings.MEDIA_ROOT, path[len("/media/") :])
    if os.path.exists(path):
        return path
    return None


def _wrap_text(text: str, max_chars: int) -> list[str]:
    text = (text or "").strip()
    if not text:
        return [""]
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]


def _signer_asset_path(recipient: Recipient, kind: str) -> str | None:
    asset = (
        SignatureAsset.objects.filter(recipient=recipient, kind=kind)
        .order_by("-created_at")
        .first()
    )
    if asset and asset.image:
        try:
            path = asset.image.path
            if os.path.exists(path):
                return path
        except Exception:
            pass
    field = (
        Field.objects.filter(
            recipient=recipient,
            field_type=kind,
        )
        .exclude(value="")
        .order_by("-completed_at", "-id")
        .first()
    )
    if field:
        return _resolve_image_path(field.value)
    return None


def _draw_wrapped(c: canvas.Canvas, text: str, x: float, y: float, max_chars: int, leading: float):
    lines = _wrap_text(text, max_chars)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def generate_certificate_pdf(envelope: Envelope) -> bytes:
    """Professional Certificate of Completion with signer signatures/initials."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    left = 54
    right = width - 54
    content_width = right - left
    page_num = 1
    tenant = envelope.tenant
    brand = _tenant_brand_color(tenant)

    recipients = list(
        envelope.recipients.select_related("contact").prefetch_related("signature_assets").all()
    )
    audit_events = list(envelope.audit_events.all())

    def ensure_space(y: float, needed: float) -> float:
        nonlocal page_num
        if y - needed >= 64:
            return y
        _draw_footer(c, envelope, page_num, width)
        c.showPage()
        page_num += 1
        return _draw_continuation_header(c, envelope, width, height, brand)

    # ── Header band ──────────────────────────────────────────────
    c.setFillColor(brand)
    c.rect(0, height - 96, width, 96, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica", 10)
    c.drawString(left, height - 36, tenant.name or "SignDesk")
    c.setFont("Helvetica-Bold", 22)
    c.drawString(left, height - 64, "Certificate of Completion")
    c.setFont("Helvetica", 9)
    c.drawRightString(right, height - 36, "Electronic Signature Record")
    completed_label = _format_cert_datetime(envelope.completed_at or timezone.now(), tenant)
    c.drawRightString(right, height - 52, completed_label)

    y = height - 124

    # ── Document summary ─────────────────────────────────────────
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(left, y, "Document")
    y -= 8
    c.setStrokeColor(RULE_GRAY)
    c.setLineWidth(1)
    c.line(left, y, right, y)
    y -= 18

    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(colors.black)
    y = _draw_wrapped(c, envelope.title or "Untitled envelope", left, y, 90, 14)
    y -= 4

    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED_GRAY)
    meta_rows = [
        ("Envelope ID", str(envelope.id)),
        ("Workspace", f"{tenant.name} ({tenant.slug})"),
        ("Status", (envelope.status or "").replace("_", " ").title()),
        ("Completed", completed_label),
        ("Timezone", tenant.timezone or "UTC"),
    ]
    for label, value in meta_rows:
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(MUTED_GRAY)
        c.drawString(left, y, f"{label}")
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.black)
        c.drawString(left + 90, y, value)
        y -= 14

    y -= 10
    y = ensure_space(y, 70)

    # ── Document integrity ───────────────────────────────────────
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(left, y, "Document integrity")
    y -= 8
    c.setStrokeColor(RULE_GRAY)
    c.line(left, y, right, y)
    y -= 18
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED_GRAY)
    c.drawString(left, y, "Pre-sign SHA-256")
    y -= 12
    c.setFillColor(colors.black)
    c.setFont("Courier", 7.5)
    y = _draw_wrapped(c, envelope.pre_sign_sha256 or "—", left, y, 100, 10)
    y -= 6
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED_GRAY)
    c.drawString(left, y, "Post-sign SHA-256")
    y -= 12
    c.setFillColor(colors.black)
    c.setFont("Courier", 7.5)
    y = _draw_wrapped(c, envelope.post_sign_sha256 or "—", left, y, 100, 10)
    y -= 16

    # ── Legal notice (ESIGN / UETA) ───────────────────────────────
    y = ensure_space(y, 90)
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(left, y, "Legal notice")
    y -= 8
    c.setStrokeColor(RULE_GRAY)
    c.line(left, y, right, y)
    y -= 16
    c.setFont("Helvetica", 8)
    c.setFillColor(colors.black)
    retention_days = tenant.document_retention_days
    if retention_days:
        retention_phrase = (
            f"Completed records are retained by the sending workspace for {retention_days} days "
            "after completion unless a longer period is required by law."
        )
    else:
        retention_phrase = (
            "Retention of completed records on the platform is controlled by the sending workspace; "
            "signers should keep their own copies."
        )
    contact_bits = []
    if tenant.sender_support_email:
        contact_bits.append(tenant.sender_support_email)
    if tenant.sender_support_phone:
        contact_bits.append(tenant.sender_support_phone)
    contact_phrase = f" Sender contact: {', '.join(contact_bits)}." if contact_bits else ""
    fee_phrase = (
        f" Paper-copy policy: {tenant.paper_copy_fee_policy.strip()}"
        if (tenant.paper_copy_fee_policy or "").strip()
        else ""
    )
    legal_notice = (
        "Electronic signatures on this envelope were collected under the U.S. Electronic "
        "Signatures in Global and National Commerce Act (E-SIGN Act) and the applicable "
        "Uniform Electronic Transactions Act (UETA). Each signer affirmatively consented "
        "to electronic records and signatures before signing. Document integrity is "
        f"evidenced by the SHA-256 hashes above. {retention_phrase}{contact_phrase}{fee_phrase}"
    )
    y = _draw_wrapped(c, legal_notice, left, y, 98, 11)
    y -= 16

    # ── Signers ──────────────────────────────────────────────────
    y = ensure_space(y, 40)
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(left, y, "Signers")
    y -= 8
    c.setStrokeColor(RULE_GRAY)
    c.line(left, y, right, y)
    y -= 14

    if not recipients:
        c.setFont("Helvetica", 9)
        c.setFillColor(MUTED_GRAY)
        c.drawString(left, y, "No recipients.")
        y -= 16

    for idx, recipient in enumerate(recipients, start=1):
        sig_path = _signer_asset_path(recipient, "signature")
        initials_path = _signer_asset_path(recipient, "initials")
        has_consent = bool(recipient.consented_at or recipient.consent_text_sha256)
        block_height = 118 if (sig_path or initials_path) else 72
        if has_consent:
            block_height += 36
        y = ensure_space(y, block_height + 12)

        # Card background
        card_top = y + 8
        card_bottom = y - block_height + 16
        c.setFillColor(LIGHT_BAND)
        c.roundRect(left, card_bottom, content_width, card_top - card_bottom, 6, fill=1, stroke=0)

        c.setFillColor(brand)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(left + 12, y, f"Signer {idx}")

        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(left + 70, y, recipient.name or "—")
        y -= 14

        c.setFont("Helvetica", 9)
        c.setFillColor(MUTED_GRAY)
        c.drawString(left + 12, y, recipient.email or "—")
        role_status = f"{(recipient.role or '').title()} · {(recipient.status or '').replace('_', ' ').title()}"
        c.drawRightString(right - 12, y, role_status)
        y -= 14

        c.setFillColor(colors.black)
        c.setFont("Helvetica", 8)
        signed_line = f"Signed: {_format_cert_datetime(recipient.signed_at, tenant)}"
        c.drawString(left + 12, y, signed_line)

        # Best-effort IP from signed audit event for this actor
        signed_event = next(
            (
                e
                for e in audit_events
                if e.event_type == AuditEvent.EventType.SIGNED
                and (
                    e.actor_email == recipient.email
                    or (e.recipient_id and e.recipient_id == recipient.id)
                )
            ),
            None,
        )
        if signed_event and signed_event.ip_address:
            c.drawRightString(right - 12, y, f"IP: {signed_event.ip_address}")
        y -= 12

        if has_consent:
            c.setFont("Helvetica", 7.5)
            c.setFillColor(MUTED_GRAY)
            consent_when = _format_cert_datetime(recipient.consented_at, tenant)
            consent_ver = recipient.consent_version or "—"
            c.drawString(left + 12, y, f"Consent: {consent_when} · Version {consent_ver}")
            if recipient.consent_ip:
                c.drawRightString(right - 12, y, f"Consent IP: {recipient.consent_ip}")
            y -= 10
            c.setFont("Courier", 6.5)
            c.setFillColor(colors.black)
            hash_label = f"Disclosure SHA-256: {recipient.consent_text_sha256 or '—'}"
            y = _draw_wrapped(c, hash_label, left + 12, y, 95, 9)
            y -= 4

        y -= 6

        # Signature / initials images
        image_y = y - 36
        col_x = left + 12
        if sig_path:
            c.setFont("Helvetica", 7)
            c.setFillColor(MUTED_GRAY)
            c.drawString(col_x, y, "SIGNATURE")
            try:
                img = ImageReader(sig_path)
                c.drawImage(
                    img,
                    col_x,
                    image_y,
                    width=160,
                    height=40,
                    mask="auto",
                    preserveAspectRatio=True,
                )
            except Exception:
                c.setFillColor(colors.black)
                c.setFont("Helvetica-Oblique", 10)
                c.drawString(col_x, image_y + 14, recipient.name)
            col_x += 180

        if initials_path:
            c.setFont("Helvetica", 7)
            c.setFillColor(MUTED_GRAY)
            c.drawString(col_x, y, "INITIALS")
            try:
                img = ImageReader(initials_path)
                c.drawImage(
                    img,
                    col_x,
                    image_y,
                    width=72,
                    height=40,
                    mask="auto",
                    preserveAspectRatio=True,
                )
            except Exception:
                c.setFillColor(colors.black)
                c.setFont("Helvetica-Oblique", 10)
                c.drawString(col_x, image_y + 14, "—")

        if sig_path or initials_path:
            y = image_y - 14
        else:
            c.setFont("Helvetica-Oblique", 8)
            c.setFillColor(MUTED_GRAY)
            c.drawString(left + 12, y, "No signature image on file")
            y -= 14

        y = min(y, card_bottom - 12)

    # ── Audit trail ──────────────────────────────────────────────
    y = ensure_space(y, 40)
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(left, y, "Audit trail")
    y -= 8
    c.setStrokeColor(RULE_GRAY)
    c.line(left, y, right, y)
    y -= 16

    # Column headers
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(MUTED_GRAY)
    c.drawString(left, y, "Time")
    c.drawString(left + 130, y, "Event")
    c.drawString(left + 250, y, "Actor")
    c.drawString(left + 400, y, "IP")
    y -= 6
    c.setStrokeColor(RULE_GRAY)
    c.line(left, y, right, y)
    y -= 12

    event_labels = {
        "created": "Created",
        "sent": "Sent",
        "viewed": "Viewed",
        "consent_accepted": "Consent accepted",
        "field_completed": "Field completed",
        "signed": "Signed",
        "declined": "Declined",
        "voided": "Voided",
        "expired": "Expired",
        "completed": "Completed",
        "reminded": "Reminded",
        "downloaded": "Downloaded",
        "retention_purged": "Retention purged",
    }

    for event in audit_events:
        y = ensure_space(y, 16)
        c.setFont("Helvetica", 7.5)
        c.setFillColor(colors.black)
        when = _format_cert_datetime(event.created_at, tenant)
        # Shorter time for table density
        if event.created_at:
            local = (
                event.created_at.astimezone(_tenant_zoneinfo(tenant))
                if timezone.is_aware(event.created_at)
                else event.created_at
            )
            when = local.strftime("%b %d, %Y %I:%M:%S %p")
        c.drawString(left, y, when[:28])
        c.drawString(left + 130, y, event_labels.get(event.event_type, event.event_type)[:22])
        actor = event.actor_name or event.actor_email or "System"
        c.drawString(left + 250, y, actor[:28])
        c.drawString(left + 400, y, str(event.ip_address or "—"))
        y -= 12

    _draw_footer(c, envelope, page_num, width)
    c.save()
    return buffer.getvalue()


def _draw_continuation_header(
    c: canvas.Canvas,
    envelope: Envelope,
    width: float,
    height: float,
    brand: colors.Color | None = None,
) -> float:
    left = 54
    right = width - 54
    c.setFillColor(brand or _tenant_brand_color(envelope.tenant))
    c.rect(0, height - 40, width, 40, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left, height - 26, "Certificate of Completion (continued)")
    c.setFont("Helvetica", 8)
    c.drawRightString(right, height - 26, (envelope.title or "")[:40])
    return height - 64


def _draw_footer(c: canvas.Canvas, envelope: Envelope, page_num: int, width: float):
    left = 54
    right = width - 54
    c.setStrokeColor(RULE_GRAY)
    c.setLineWidth(0.5)
    c.line(left, 42, right, 42)
    c.setFillColor(MUTED_GRAY)
    c.setFont("Helvetica", 7)
    retention_days = envelope.tenant.document_retention_days
    retention_note = (
        f"retained for {retention_days} days after completion"
        if retention_days
        else "retention controlled by sending workspace"
    )
    c.drawString(
        left,
        28,
        f"ESIGN/UETA electronic signature record · {retention_note}.",
    )
    c.drawRightString(right, 28, f"Page {page_num}")
    c.drawString(left, 16, f"{envelope.tenant.name} · Envelope #{envelope.id}")


def regenerate_certificate(envelope: Envelope) -> Envelope:
    """Rebuild and store the Certificate of Completion for a completed envelope."""
    cert_bytes = generate_certificate_pdf(envelope)
    envelope.certificate_file.save(
        f"envelope-{envelope.id}-certificate.pdf", ContentFile(cert_bytes), save=True
    )
    return envelope


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
    # Set completed_at before generating certificate so the PDF shows the timestamp
    envelope.status = Envelope.Status.COMPLETED
    envelope.completed_at = timezone.now()
    cert_bytes = generate_certificate_pdf(envelope)
    envelope.certificate_file.save(
        f"envelope-{envelope.id}-certificate.pdf", ContentFile(cert_bytes), save=False
    )
    envelope.save()

    record_audit(
        tenant=envelope.tenant,
        envelope=envelope,
        event_type=AuditEvent.EventType.COMPLETED,
        payload={"post_sign_sha256": digest},
    )

    seen_contacts: set[int] = set()
    for recipient in envelope.recipients.select_related("contact", "contact__company"):
        if not recipient.contact_id or recipient.contact_id in seen_contacts:
            continue
        seen_contacts.add(recipient.contact_id)
        Activity.objects.create(
            tenant=envelope.tenant,
            contact=recipient.contact,
            company=recipient.contact.company,
            kind=Activity.Kind.ENVELOPE_COMPLETED,
            message=f"Envelope '{envelope.title}' completed",
            metadata={"envelope_id": envelope.id},
        )

    from apps.envelopes.tasks import send_completion_emails

    send_completion_emails.delay(envelope.id)
    return envelope
