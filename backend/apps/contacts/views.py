import csv
import io

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.contacts.models import (
    Activity,
    Company,
    Contact,
    FollowUpPlan,
    FollowUpPlanEnrollment,
    FollowUpTask,
    Listing,
)
from apps.contacts.serializers import (
    ActivitySerializer,
    CompanySerializer,
    ContactSerializer,
    FollowUpPlanEnrollmentSerializer,
    FollowUpPlanSerializer,
    FollowUpTaskSerializer,
    ListingSerializer,
)
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
    filterset_fields = ("company", "stage")
    ordering_fields = (
        "last_name",
        "first_name",
        "created_at",
        "email",
        "next_follow_up_at",
        "stage",
    )

    def get_queryset(self):
        qs = super().get_queryset()
        due = self.request.query_params.get("follow_up_due")
        if due and due.lower() in ("1", "true", "yes"):
            qs = qs.filter(next_follow_up_at__isnull=False, next_follow_up_at__lte=timezone.now())
        tag = self.request.query_params.get("tag")
        if tag:
            qs = qs.filter(tags__contains=[tag])
        return qs

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

    @action(detail=True, methods=["post"], url_path="schedule-follow-up")
    def schedule_follow_up(self, request, pk=None):
        contact = self.get_object()
        title = (request.data.get("title") or "Follow up").strip()[:255]
        due_at = request.data.get("due_at")
        notes = request.data.get("notes") or ""
        if not due_at:
            return Response({"detail": "due_at is required."}, status=400)
        task = FollowUpTask.objects.create(
            tenant=request.tenant,
            contact=contact,
            title=title,
            due_at=due_at,
            notes=notes,
            created_by=request.user,
        )
        contact.next_follow_up_at = task.due_at
        contact.save(update_fields=["next_follow_up_at", "updated_at"])
        Activity.objects.create(
            tenant=request.tenant,
            contact=contact,
            company=contact.company,
            kind=Activity.Kind.FOLLOW_UP,
            message=f"Follow-up scheduled: {title}",
            metadata={"follow_up_task_id": task.id, "due_at": str(task.due_at)},
        )
        return Response(FollowUpTaskSerializer(task).data, status=status.HTTP_201_CREATED)


class ListingViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = Listing.objects.all()
    serializer_class = ListingSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    search_fields = ("address", "city", "mls_number", "postal_code")
    ordering_fields = ("created_at", "address", "price", "mls_number")

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not getattr(request.tenant, "listings_enabled", False):
            self.permission_denied(
                request,
                message="Prefill records (Listings) are disabled for this workspace.",
            )

    def perform_destroy(self, instance):
        instance.is_archived = True
        instance.save(update_fields=["is_archived", "updated_at"])

    @action(detail=False, methods=["post"], url_path="import-csv")
    def import_csv(self, request):
        """Import listings from CSV (MLS export or manual).

        Expected headers (case-insensitive, flexible):
        address, city, state, postal_code|zip, mls_number|mls#, price,
        beds, baths, sqft, year_built, description
        """
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "CSV file is required."}, status=400)
        try:
            text = uploaded.read().decode("utf-8-sig")
        except UnicodeDecodeError:
            return Response({"detail": "CSV must be UTF-8 encoded."}, status=400)
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            return Response({"detail": "CSV has no header row."}, status=400)

        def pick(row, *keys):
            lower = {str(k).strip().lower(): v for k, v in row.items() if k}
            for key in keys:
                if key in lower and lower[key] not in (None, ""):
                    return str(lower[key]).strip()
            return ""

        created = 0
        updated = 0
        errors = []
        for idx, row in enumerate(reader, start=2):
            address = pick(row, "address", "street", "street_address")
            if not address:
                errors.append(f"Row {idx}: address required")
                continue
            mls = pick(row, "mls_number", "mls#", "mls", "listing_id")
            data = {
                "address": address[:255],
                "city": pick(row, "city")[:100],
                "state": pick(row, "state")[:50],
                "postal_code": pick(row, "postal_code", "zip", "zipcode", "zip_code")[:20],
                "mls_number": mls[:64] if mls else None,
                "price": pick(row, "price", "list_price")[:64],
                "description": pick(row, "description", "remarks"),
                "source": (request.data.get("source") or "csv")[:64],
                "raw_data": dict(row),
            }
            for num_field, keys in (
                ("beds", ("beds", "bedrooms")),
                ("baths", ("baths", "bathrooms")),
            ):
                raw = pick(row, *keys)
                if raw:
                    data[num_field] = raw
            sqft = pick(row, "sqft", "square_feet", "living_area")
            if sqft:
                try:
                    data["sqft"] = int(float(sqft.replace(",", "")))
                except ValueError:
                    pass
            year_built = pick(row, "year_built", "yr_built")
            if year_built:
                try:
                    data["year_built"] = int(year_built)
                except ValueError:
                    pass

            existing = None
            if mls:
                existing = Listing.objects.for_tenant(request.tenant).filter(
                    mls_number=mls, is_archived=False
                ).first()
            if existing:
                for k, v in data.items():
                    setattr(existing, k, v)
                existing.save()
                updated += 1
            else:
                Listing.objects.create(tenant=request.tenant, **data)
                created += 1

        return Response(
            {"created": created, "updated": updated, "errors": errors[:50]},
            status=status.HTTP_201_CREATED,
        )


class FollowUpTaskViewSet(viewsets.ModelViewSet):
    permission_classes = [IsTenantMember]
    serializer_class = FollowUpTaskSerializer
    filterset_fields = ("status", "contact")
    ordering_fields = ("due_at", "created_at")

    def get_queryset(self):
        qs = (
            FollowUpTask.objects.for_tenant(self.request.tenant)
            .select_related("contact")
            .order_by("due_at")
        )
        due = self.request.query_params.get("due")
        if due and due.lower() in ("1", "true", "yes", "today"):
            qs = qs.filter(
                status=FollowUpTask.Status.OPEN,
                due_at__lte=timezone.now(),
            )
        return qs

    def perform_create(self, serializer):
        task = serializer.save(tenant=self.request.tenant, created_by=self.request.user)
        contact = task.contact
        if contact.next_follow_up_at is None or task.due_at < contact.next_follow_up_at:
            contact.next_follow_up_at = task.due_at
            contact.save(update_fields=["next_follow_up_at", "updated_at"])

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        task = self.get_object()
        task.status = FollowUpTask.Status.DONE
        task.completed_at = timezone.now()
        task.save(update_fields=["status", "completed_at", "updated_at"])
        Activity.objects.create(
            tenant=request.tenant,
            contact=task.contact,
            company=task.contact.company,
            kind=Activity.Kind.FOLLOW_UP,
            message=f"Follow-up completed: {task.title}",
            metadata={"follow_up_task_id": task.id},
        )
        # Refresh contact next_follow_up_at from remaining open tasks
        next_open = (
            FollowUpTask.objects.for_tenant(request.tenant)
            .filter(contact=task.contact, status=FollowUpTask.Status.OPEN)
            .order_by("due_at")
            .first()
        )
        task.contact.next_follow_up_at = next_open.due_at if next_open else None
        task.contact.save(update_fields=["next_follow_up_at", "updated_at"])
        return Response(FollowUpTaskSerializer(task).data)


class FollowUpPlanViewSet(viewsets.ModelViewSet):
    permission_classes = [IsTenantMember]
    serializer_class = FollowUpPlanSerializer
    search_fields = ("name",)
    filterset_fields = ("trigger", "is_active")

    def get_queryset(self):
        return (
            FollowUpPlan.objects.for_tenant(self.request.tenant)
            .filter(is_archived=False)
            .prefetch_related("steps")
        )

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)

    def perform_destroy(self, instance):
        instance.is_archived = True
        instance.save(update_fields=["is_archived", "updated_at"])


class FollowUpPlanEnrollmentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsTenantMember]
    serializer_class = FollowUpPlanEnrollmentSerializer
    http_method_names = ["get", "patch", "delete", "head", "options"]
    filterset_fields = ("status", "plan", "envelope", "contact")

    def get_queryset(self):
        return (
            FollowUpPlanEnrollment.objects.for_tenant(self.request.tenant)
            .select_related("contact", "plan", "envelope", "recipient")
        )

    def perform_destroy(self, instance):
        instance.status = FollowUpPlanEnrollment.Status.CANCELLED
        instance.next_run_at = None
        instance.save(update_fields=["status", "next_run_at", "updated_at"])
