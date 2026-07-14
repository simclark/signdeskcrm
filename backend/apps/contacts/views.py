from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.contacts.models import Activity, Company, Contact
from apps.contacts.serializers import ActivitySerializer, CompanySerializer, ContactSerializer
from apps.envelopes.models import Envelope
from apps.envelopes.serializers import EnvelopeListSerializer
from apps.tenants.permissions import IsTenantMember


class TenantScopedMixin:
    permission_classes = [IsTenantMember]

    def get_queryset(self):
        return self.queryset.model.objects.for_tenant(self.request.tenant).filter(
            is_archived=False
        )

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)


def _create_note_activity(*, tenant, message: str, contact=None, company=None, actor_email=""):
    text = (message or "").strip()
    if not text:
        return None, Response(
            {"detail": "Message is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    activity = Activity.objects.create(
        tenant=tenant,
        contact=contact,
        company=company,
        kind=Activity.Kind.NOTE,
        message=text,
        metadata={"created_by": actor_email or ""},
    )
    return activity, None


class CompanyViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = Company.objects.all()
    serializer_class = CompanySerializer
    search_fields = ("name", "website")
    ordering_fields = ("name", "created_at")

    def perform_create(self, serializer):
        company = serializer.save(tenant=self.request.tenant)
        Activity.objects.create(
            tenant=self.request.tenant,
            company=company,
            kind=Activity.Kind.CREATED,
            message=f"Company {company.name} created",
        )

    def perform_update(self, serializer):
        company = serializer.save()
        Activity.objects.create(
            tenant=self.request.tenant,
            company=company,
            kind=Activity.Kind.UPDATED,
            message=f"Company {company.name} updated",
        )

    def perform_destroy(self, instance):
        instance.is_archived = True
        instance.save(update_fields=["is_archived", "updated_at"])

    @action(detail=True, methods=["get"])
    def activities(self, request, pk=None):
        company = self.get_object()
        qs = Activity.objects.for_tenant(request.tenant).filter(company=company)
        return Response(ActivitySerializer(qs[:50], many=True).data)

    @action(detail=True, methods=["post"])
    def notes(self, request, pk=None):
        company = self.get_object()
        activity, error = _create_note_activity(
            tenant=request.tenant,
            message=request.data.get("message", ""),
            company=company,
            actor_email=getattr(request.user, "email", "") or "",
        )
        if error:
            return error
        return Response(ActivitySerializer(activity).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def envelopes(self, request, pk=None):
        company = self.get_object()
        qs = (
            Envelope.objects.for_tenant(request.tenant)
            .filter(recipients__contact__company=company)
            .distinct()
            .order_by("-created_at")[:50]
        )
        return Response(EnvelopeListSerializer(qs, many=True).data)


class ContactViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = Contact.objects.select_related("company").all()
    serializer_class = ContactSerializer
    search_fields = ("first_name", "last_name", "email", "title")
    filterset_fields = ("company",)
    ordering_fields = ("last_name", "first_name", "created_at", "email")

    def perform_create(self, serializer):
        contact = serializer.save(tenant=self.request.tenant)
        Activity.objects.create(
            tenant=self.request.tenant,
            contact=contact,
            company=contact.company,
            kind=Activity.Kind.CREATED,
            message=f"Contact {contact.full_name} created",
        )

    def perform_update(self, serializer):
        contact = serializer.save()
        Activity.objects.create(
            tenant=self.request.tenant,
            contact=contact,
            company=contact.company,
            kind=Activity.Kind.UPDATED,
            message=f"Contact {contact.full_name} updated",
        )

    def perform_destroy(self, instance):
        instance.is_archived = True
        instance.save(update_fields=["is_archived", "updated_at"])

    @action(detail=True, methods=["get"])
    def activities(self, request, pk=None):
        contact = self.get_object()
        qs = Activity.objects.for_tenant(request.tenant).filter(contact=contact)
        return Response(ActivitySerializer(qs[:50], many=True).data)

    @action(detail=True, methods=["post"])
    def notes(self, request, pk=None):
        contact = self.get_object()
        activity, error = _create_note_activity(
            tenant=request.tenant,
            message=request.data.get("message", ""),
            contact=contact,
            company=contact.company,
            actor_email=getattr(request.user, "email", "") or "",
        )
        if error:
            return error
        return Response(ActivitySerializer(activity).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def envelopes(self, request, pk=None):
        contact = self.get_object()
        qs = (
            Envelope.objects.for_tenant(request.tenant)
            .filter(recipients__contact=contact)
            .distinct()
            .order_by("-created_at")[:50]
        )
        return Response(EnvelopeListSerializer(qs, many=True).data)
