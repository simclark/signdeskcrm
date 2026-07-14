import base64
import mimetypes
import uuid

from django.core.files.base import ContentFile
from django.http import FileResponse
from django.utils import timezone
from rest_framework import status, views
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.audit.models import AuditEvent
from apps.documents.serializers import DocumentVersionSerializer
from apps.envelopes.models import Envelope, Field, Recipient, SignatureAsset
from apps.envelopes.serializers import FieldSerializer
from apps.envelopes.services import (
    accept_consent,
    complete_recipient_signing,
    mark_viewed,
    record_audit,
    require_consent,
    require_signer_turn,
)
from apps.tenants.esign_disclosure import resolve_acknowledgement


class SigningThrottle(ScopedRateThrottle):
    scope = "signing"


def get_recipient_by_token(token: str) -> Recipient:
    return Recipient.objects.select_related(
        "envelope", "envelope__document", "envelope__document_version", "tenant"
    ).get(access_token=token)


def _download_paths(token: str) -> dict:
    return {
        "signed_download_url": f"/api/sign/{token}/download/?kind=signed",
        "certificate_download_url": f"/api/sign/{token}/download/?kind=certificate",
    }


def _consent_denied_response():
    return Response(
        {
            "detail": (
                "You must accept the electronic records and signatures disclosure "
                "before continuing."
            )
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _turn_denied_response(exc: PermissionError):
    return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)


class SigningSessionView(views.APIView):
    permission_classes = [AllowAny]
    throttle_classes = [SigningThrottle]

    def get(self, request, token):
        try:
            recipient = get_recipient_by_token(token)
        except Recipient.DoesNotExist:
            return Response({"detail": "Invalid link."}, status=status.HTTP_404_NOT_FOUND)

        envelope = recipient.envelope
        if envelope.status in (
            Envelope.Status.VOIDED,
            Envelope.Status.EXPIRED,
            Envelope.Status.DECLINED,
        ):
            return Response(
                {"detail": f"This envelope is {envelope.status}."},
                status=status.HTTP_410_GONE,
            )
        if (
            envelope.status != Envelope.Status.COMPLETED
            and envelope.expires_at
            and envelope.expires_at < timezone.now()
        ):
            envelope.status = Envelope.Status.EXPIRED
            envelope.save(update_fields=["status", "updated_at"])
            return Response({"detail": "This envelope has expired."}, status=410)

        if envelope.status != Envelope.Status.COMPLETED:
            try:
                require_signer_turn(recipient)
            except PermissionError as exc:
                return _turn_denied_response(exc)
            mark_viewed(recipient, request)

        version = envelope.document_version
        completed = (
            envelope.status == Envelope.Status.COMPLETED
            and bool(envelope.signed_file)
            and not envelope.retention_purged_at
        )
        tenant = envelope.tenant
        # Show the snapshot already accepted, otherwise the live tenant disclosure.
        if recipient.consented_at and recipient.consent_text:
            consent_text = recipient.consent_text
            consent_version = recipient.consent_version
        else:
            consent_text, consent_version = resolve_acknowledgement(tenant)
        logo_url = None
        icon_url = None
        if tenant.logo:
            logo_url = request.build_absolute_uri(tenant.logo.url)
        if tenant.icon:
            icon_url = request.build_absolute_uri(tenant.icon.url)
        payload = {
            "consent_version": consent_version,
            "consent_text": consent_text,
            "has_consented": bool(recipient.consented_at),
            "recipient": {
                "id": recipient.id,
                "name": recipient.name,
                "email": recipient.email,
                "status": recipient.status,
                "role": recipient.role,
            },
            "envelope": {
                "id": envelope.id,
                "title": envelope.title,
                "message": envelope.message,
                "status": envelope.status,
                "tenant_name": tenant.name,
                "accent_color": tenant.accent_color,
                "logo_url": logo_url,
                "icon_url": icon_url,
                "support_email": tenant.sender_support_email or "",
                "support_phone": tenant.sender_support_phone or "",
                "paper_copy_fee_policy": tenant.paper_copy_fee_policy or "",
                "document_retention_days": tenant.document_retention_days,
                "retention_purged": bool(envelope.retention_purged_at),
            },
            "document": DocumentVersionSerializer(
                version, context={"request": request}
            ).data
            if version
            else None,
            "fields": FieldSerializer(
                envelope.fields.filter(
                    recipient=recipient,
                    fill_mode=Field.FillMode.SIGNER,
                ),
                many=True,
            ).data,
            "downloads_ready": completed,
        }
        if completed:
            payload.update(_download_paths(token))
        return Response(payload)


class SigningDownloadView(views.APIView):
    """Public token-based download of the completed signed PDF or certificate."""

    permission_classes = [AllowAny]
    throttle_classes = [SigningThrottle]

    def get(self, request, token):
        try:
            recipient = get_recipient_by_token(token)
        except Recipient.DoesNotExist:
            return Response({"detail": "Invalid link."}, status=status.HTTP_404_NOT_FOUND)

        envelope = recipient.envelope
        if envelope.status != Envelope.Status.COMPLETED:
            return Response(
                {"detail": "The signed document is not ready yet."},
                status=status.HTTP_409_CONFLICT,
            )
        if envelope.retention_purged_at:
            return Response(
                {
                    "detail": (
                        "These records are no longer available online under the "
                        "sender’s retention policy. Contact the sender for a copy."
                    )
                },
                status=status.HTTP_410_GONE,
            )

        kind = request.query_params.get("kind", "signed")
        if kind == "certificate":
            file_field = envelope.certificate_file
            filename = f"{envelope.title}-certificate.pdf"
        elif kind == "signed":
            file_field = envelope.signed_file
            filename = f"{envelope.title}-signed.pdf"
        else:
            return Response({"detail": "Unknown download kind."}, status=400)

        if not file_field:
            return Response(
                {"detail": "File not available."},
                status=status.HTTP_404_NOT_FOUND,
            )

        meta = {}
        xff = request.META.get("HTTP_X_FORWARDED_FOR")
        meta["ip_address"] = (
            xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR")
        )
        meta["user_agent"] = request.META.get("HTTP_USER_AGENT", "")[:1000]
        record_audit(
            tenant=recipient.tenant,
            envelope=envelope,
            event_type=AuditEvent.EventType.DOWNLOADED,
            recipient=recipient,
            actor_email=recipient.email,
            actor_name=recipient.name,
            payload={"kind": kind},
            **meta,
        )

        safe_name = "".join(c if c.isalnum() or c in "._- " else "_" for c in filename)
        content_type = mimetypes.guess_type(safe_name)[0] or "application/pdf"
        response = FileResponse(file_field.open("rb"), content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{safe_name}"'
        return response


class SigningConsentView(views.APIView):
    permission_classes = [AllowAny]
    throttle_classes = [SigningThrottle]

    def post(self, request, token):
        try:
            recipient = get_recipient_by_token(token)
        except Recipient.DoesNotExist:
            return Response({"detail": "Invalid link."}, status=404)
        try:
            require_signer_turn(recipient)
        except PermissionError as exc:
            return _turn_denied_response(exc)
        accept_consent(recipient, request)
        recipient.refresh_from_db()
        return Response(
            {
                "ok": True,
                "consent_version": recipient.consent_version,
                "consent_text_sha256": recipient.consent_text_sha256,
                "has_consented": True,
            }
        )


class SigningFieldCompleteView(views.APIView):
    permission_classes = [AllowAny]
    throttle_classes = [SigningThrottle]

    def post(self, request, token, field_id):
        try:
            recipient = get_recipient_by_token(token)
        except Recipient.DoesNotExist:
            return Response({"detail": "Invalid link."}, status=404)
        try:
            require_signer_turn(recipient)
        except PermissionError as exc:
            return _turn_denied_response(exc)
        try:
            require_consent(recipient)
        except PermissionError:
            return _consent_denied_response()
        try:
            field = recipient.fields.get(pk=field_id, fill_mode=Field.FillMode.SIGNER)
        except Field.DoesNotExist:
            return Response({"detail": "Field not found."}, status=404)

        value = request.data.get("value", "")
        image_data = request.data.get("image_data")
        if image_data and field.field_type in (
            Field.FieldType.SIGNATURE,
            Field.FieldType.INITIALS,
        ):
            header, encoded = image_data.split(",", 1) if "," in image_data else ("", image_data)
            raw = base64.b64decode(encoded)
            filename = f"{uuid.uuid4().hex}.png"
            asset = SignatureAsset(tenant=recipient.tenant, recipient=recipient, kind=field.field_type)
            asset.image.save(filename, ContentFile(raw), save=True)
            value = asset.image.path

        field.value = str(value)
        field.completed_at = timezone.now()
        field.save(update_fields=["value", "completed_at", "updated_at"])
        return Response(FieldSerializer(field).data)


class SigningSubmitView(views.APIView):
    permission_classes = [AllowAny]
    throttle_classes = [SigningThrottle]

    def post(self, request, token):
        try:
            recipient = get_recipient_by_token(token)
        except Recipient.DoesNotExist:
            return Response({"detail": "Invalid link."}, status=404)
        if recipient.role != Recipient.Role.SIGNER:
            return Response({"detail": "Not a signer."}, status=400)
        try:
            require_signer_turn(recipient)
        except PermissionError as exc:
            return _turn_denied_response(exc)
        try:
            require_consent(recipient)
        except PermissionError:
            return _consent_denied_response()
        try:
            complete_recipient_signing(recipient, request)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        recipient.refresh_from_db()
        return Response(
            {
                "status": recipient.status,
                "envelope_status": recipient.envelope.status,
            }
        )


class SigningDeclineView(views.APIView):
    permission_classes = [AllowAny]
    throttle_classes = [SigningThrottle]

    def post(self, request, token):
        try:
            recipient = get_recipient_by_token(token)
        except Recipient.DoesNotExist:
            return Response({"detail": "Invalid link."}, status=404)
        try:
            require_signer_turn(recipient)
        except PermissionError as exc:
            return _turn_denied_response(exc)
        reason = request.data.get("reason", "")
        recipient.status = Recipient.Status.DECLINED
        recipient.decline_reason = reason
        recipient.save(update_fields=["status", "decline_reason", "updated_at"])
        envelope = recipient.envelope
        envelope.status = Envelope.Status.DECLINED
        envelope.save(update_fields=["status", "updated_at"])
        from apps.envelopes.services import record_audit
        from apps.audit.models import AuditEvent

        record_audit(
            tenant=recipient.tenant,
            envelope=envelope,
            event_type=AuditEvent.EventType.DECLINED,
            recipient=recipient,
            actor_email=recipient.email,
            actor_name=recipient.name,
            payload={"reason": reason},
        )
        return Response({"status": "declined"})
