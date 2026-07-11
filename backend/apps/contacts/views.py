from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.contacts.models import Activity, Company, Contact
from apps.contacts.serializers import ActivitySerializer, CompanySerializer, ContactSerializer
from apps.tenants.permissions import IsTenantMember


class TenantScopedMixin:
    permission_classes = [IsTenantMember]

    def get_queryset(self):
        return self.queryset.model.objects.for_tenant(self.request.tenant).filter(
            is_archived=False
        )

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)


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

    def perform_destroy(self, instance):
        instance.is_archived = True
        instance.save(update_fields=["is_archived", "updated_at"])


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
