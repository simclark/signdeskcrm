from datetime import timedelta

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.audit.models import AuditEvent
from apps.audit.serializers import AuditEventSerializer
from apps.envelopes.models import Envelope, Field, Recipient
from apps.envelopes.serializers import (
    EnvelopeListSerializer,
    EnvelopeSerializer,
    FieldSerializer,
    RecipientSerializer,
)
from apps.envelopes.services import (
    next_copy_title,
    record_audit,
    regenerate_certificate as rebuild_certificate_pdf,
    send_envelope,
)
from apps.tenants.permissions import IsTenantMember


class EnvelopeViewSet(viewsets.ModelViewSet):
    permission_classes = [IsTenantMember]
    search_fields = ("title",)
    filterset_fields = ("status",)
    ordering_fields = ("created_at", "sent_at", "completed_at", "title")

    def get_queryset(self):
        return (
            Envelope.objects.for_tenant(self.request.tenant)
            .prefetch_related("recipients", "fields")
            .select_related("document", "document_version")
        )

    def get_serializer_class(self):
        if self.action == "list":
            return EnvelopeListSerializer
        return EnvelopeSerializer

    def perform_create(self, serializer):
        envelope = serializer.save()
        record_audit(
            tenant=self.request.tenant,
            envelope=envelope,
            event_type=AuditEvent.EventType.CREATED,
            actor_email=self.request.user.email,
            actor_name=self.request.user.full_name,
        )

    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        envelope = self.get_object()
        if envelope.status != Envelope.Status.DRAFT:
            return Response(
                {"detail": "Only draft envelopes can be sent."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            send_envelope(envelope, request)
        except ValueError as exc:
            return Response({"errors": str(exc).split("; ")}, status=status.HTTP_400_BAD_REQUEST)
        return Response(EnvelopeSerializer(envelope, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        envelope = self.get_object()
        if envelope.status in (
            Envelope.Status.COMPLETED,
            Envelope.Status.VOIDED,
        ):
            return Response(
                {"detail": "Cannot void this envelope."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        envelope.status = Envelope.Status.VOIDED
        envelope.voided_at = timezone.now()
        envelope.void_reason = request.data.get("reason", "")
        envelope.save()
        record_audit(
            tenant=request.tenant,
            envelope=envelope,
            event_type=AuditEvent.EventType.VOIDED,
            actor_email=request.user.email,
            actor_name=request.user.full_name,
            payload={"reason": envelope.void_reason},
        )
        return Response(EnvelopeSerializer(envelope, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        source = self.get_object()
        clone = Envelope.objects.create(
            tenant=request.tenant,
            title=next_copy_title(source.title),
            message=source.message,
            routing=source.routing,
            document=source.document,
            document_version=source.document_version,
            template=source.template,
            created_by=request.user,
            status=Envelope.Status.DRAFT,
        )
        recipient_map = {}
        for r in source.recipients.all():
            nr = Recipient.objects.create(
                tenant=request.tenant,
                envelope=clone,
                contact=r.contact,
                name=r.name,
                email=r.email,
                role=r.role,
                routing_order=r.routing_order,
            )
            recipient_map[r.id] = nr
        for f in source.fields.all():
            Field.objects.create(
                tenant=request.tenant,
                envelope=clone,
                recipient=recipient_map[f.recipient_id],
                field_type=f.field_type,
                page=f.page,
                x=f.x,
                y=f.y,
                w=f.w,
                h=f.h,
                required=f.required,
                label=f.label,
            )
        return Response(
            EnvelopeSerializer(clone, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def resend(self, request, pk=None):
        envelope = self.get_object()
        from apps.envelopes.tasks import send_recipient_invite

        pending = envelope.recipients.filter(
            role=Recipient.Role.SIGNER,
            status__in=[
                Recipient.Status.SENT,
                Recipient.Status.VIEWED,
                Recipient.Status.PENDING,
            ],
        )
        for recipient in pending:
            send_recipient_invite.delay(recipient.id)
        return Response({"resent": pending.count()})

    @action(detail=True, methods=["get"])
    def audit(self, request, pk=None):
        envelope = self.get_object()
        events = envelope.audit_events.all()
        return Response(AuditEventSerializer(events, many=True).data)

    @action(detail=True, methods=["post"], url_path="regenerate-certificate")
    def regenerate_certificate(self, request, pk=None):
        envelope = self.get_object()
        if envelope.status != Envelope.Status.COMPLETED:
            return Response(
                {"detail": "Only completed envelopes have a certificate."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rebuild_certificate_pdf(envelope)
        envelope.refresh_from_db()
        return Response(EnvelopeSerializer(envelope, context={"request": request}).data)

    @action(detail=True, methods=["put", "patch"])
    def recipients(self, request, pk=None):
        envelope = self.get_object()
        if envelope.status != Envelope.Status.DRAFT:
            return Response({"detail": "Locked."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = RecipientSerializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)
        envelope.recipients.all().delete()
        created = []
        for item in serializer.validated_data:
            created.append(
                Recipient.objects.create(tenant=request.tenant, envelope=envelope, **item)
            )
        return Response(RecipientSerializer(created, many=True).data)

    @action(detail=True, methods=["put", "patch"])
    def fields(self, request, pk=None):
        envelope = self.get_object()
        if envelope.status != Envelope.Status.DRAFT:
            return Response({"detail": "Locked."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = FieldSerializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)
        envelope.fields.all().delete()
        created = []
        for item in serializer.validated_data:
            created.append(
                Field.objects.create(tenant=request.tenant, envelope=envelope, **item)
            )
        return Response(FieldSerializer(created, many=True).data)


class DashboardViewSet(viewsets.ViewSet):
    permission_classes = [IsTenantMember]

    def list(self, request):
        qs = Envelope.objects.for_tenant(request.tenant)
        now = timezone.now()
        data = {
            "awaiting_others": qs.filter(
                status__in=[Envelope.Status.SENT, Envelope.Status.IN_PROGRESS]
            ).count(),
            "completed": qs.filter(status=Envelope.Status.COMPLETED).count(),
            "drafts": qs.filter(status=Envelope.Status.DRAFT).count(),
            "expiring_soon": qs.filter(
                status__in=[Envelope.Status.SENT, Envelope.Status.IN_PROGRESS],
                expires_at__lte=now + timedelta(days=3),
                expires_at__gt=now,
            ).count(),
            "recent": EnvelopeListSerializer(
                qs.order_by("-updated_at")[:8], many=True
            ).data,
        }
        return Response(data)
