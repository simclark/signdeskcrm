import base64
import os
import uuid

from django.conf import settings
from django.core.files.base import ContentFile
from django.utils import timezone
from rest_framework import status, views
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.envelopes.models import Envelope, Field, Recipient, SignatureAsset
from apps.envelopes.serializers import EnvelopeSerializer, FieldSerializer
from apps.envelopes.services import (
    CONSENT_VERSION,
    accept_consent,
    complete_recipient_signing,
    mark_viewed,
)
from apps.documents.serializers import DocumentVersionSerializer


class SigningThrottle(ScopedRateThrottle):
    scope = "signing"


def get_recipient_by_token(token: str) -> Recipient:
    return Recipient.objects.select_related(
        "envelope", "envelope__document", "envelope__document_version", "tenant"
    ).get(access_token=token)


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
        if envelope.expires_at and envelope.expires_at < timezone.now():
            envelope.status = Envelope.Status.EXPIRED
            envelope.save(update_fields=["status", "updated_at"])
            return Response({"detail": "This envelope has expired."}, status=410)

        mark_viewed(recipient, request)
        version = envelope.document_version
        return Response(
            {
                "consent_version": CONSENT_VERSION,
                "consent_text": (
                    "By continuing, you agree to conduct this transaction electronically, "
                    "to receive records electronically, and that your electronic signature "
                    "is legally binding. You may request a paper copy and withdraw consent "
                    "by contacting the sender."
                ),
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
                    "tenant_name": envelope.tenant.name,
                    "accent_color": envelope.tenant.accent_color,
                },
                "document": DocumentVersionSerializer(
                    version, context={"request": request}
                ).data
                if version
                else None,
                "fields": FieldSerializer(
                    envelope.fields.filter(recipient=recipient), many=True
                ).data,
            }
        )


class SigningConsentView(views.APIView):
    permission_classes = [AllowAny]
    throttle_classes = [SigningThrottle]

    def post(self, request, token):
        try:
            recipient = get_recipient_by_token(token)
        except Recipient.DoesNotExist:
            return Response({"detail": "Invalid link."}, status=404)
        accept_consent(recipient, request)
        return Response({"ok": True, "consent_version": CONSENT_VERSION})


class SigningFieldCompleteView(views.APIView):
    permission_classes = [AllowAny]
    throttle_classes = [SigningThrottle]

    def post(self, request, token, field_id):
        try:
            recipient = get_recipient_by_token(token)
        except Recipient.DoesNotExist:
            return Response({"detail": "Invalid link."}, status=404)
        try:
            field = recipient.fields.get(pk=field_id)
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
