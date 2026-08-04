"""Staff-only platform APIs for cross-tenant ops (platform subdomain)."""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import generics, serializers, status, views
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from apps.common.media_inventory import (
    MEDIA_PREFIXES,
    build_media_inventory,
    delete_orphan_files,
)
from apps.tenants.models import (
    INVITE_EXPIRY_DAYS,
    Invitation,
    Membership,
    PlatformOpsEvent,
    Tenant,
)
from apps.tenants.entitlements import (
    entitlement_payload,
    extend_trial,
    mark_subscription_active,
)
from apps.tenants.serializers import InvitationSerializer, MembershipSerializer
from apps.tenants.services.demo import DEMO_SLUG, reset_demo_tenant
from apps.tenants.services.ops_audit import log_platform_op
from apps.tenants.services.provision import provision_tenant

User = get_user_model()

MEDIA_DELETE_CONFIRM = "DELETE ORPHANS"


class PlatformTenantListSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True)
    entitlement = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = (
            "id",
            "name",
            "slug",
            "status",
            "created_at",
            "primary_contact_email",
            "member_count",
            "subscription_status",
            "trial_ends_at",
            "entitlement",
        )

    def get_entitlement(self, obj):
        return entitlement_payload(obj)


class PlatformTenantDetailSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    members = serializers.SerializerMethodField()
    workspace_url = serializers.SerializerMethodField()
    login_url = serializers.SerializerMethodField()
    entitlement = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = (
            "id",
            "name",
            "slug",
            "status",
            "legal_name",
            "website",
            "primary_contact_name",
            "primary_contact_email",
            "primary_contact_phone",
            "created_at",
            "updated_at",
            "listings_enabled",
            "subscription_status",
            "trial_ends_at",
            "trial_warning_sent_at",
            "entitlement",
            "member_count",
            "members",
            "workspace_url",
            "login_url",
        )
        read_only_fields = fields

    def get_member_count(self, obj) -> int:
        return obj.memberships.filter(is_active=True).count()

    def get_members(self, obj):
        qs = obj.memberships.filter(is_active=True).select_related("user").order_by("role", "id")
        return MembershipSerializer(qs, many=True).data

    def get_workspace_url(self, obj) -> str:
        return obj.frontend_url("/app")

    def get_login_url(self, obj) -> str:
        return obj.frontend_url("/login")

    def get_entitlement(self, obj):
        return entitlement_payload(obj)


class PlatformProvisionSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    slug = serializers.SlugField(max_length=63)
    owner_email = serializers.EmailField()
    owner_first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    owner_last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    owner_password = serializers.CharField(
        max_length=128,
        required=False,
        allow_blank=True,
        write_only=True,
        help_text="If omitted, an admin invitation is emailed instead.",
    )

    def validate_slug(self, value):
        return slugify(value)

    def create(self, validated_data):
        password = (validated_data.get("owner_password") or "").strip() or None
        try:
            return provision_tenant(
                name=validated_data["name"],
                slug=validated_data["slug"],
                owner_email=validated_data["owner_email"],
                owner_first_name=validated_data.get("owner_first_name", ""),
                owner_last_name=validated_data.get("owner_last_name", ""),
                owner_password=password,
                invited_by=self.context["request"].user,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc


class PlatformTenantPatchSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Tenant.Status.choices, required=False)
    name = serializers.CharField(max_length=255, required=False)
    primary_contact_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    primary_contact_email = serializers.EmailField(required=False, allow_blank=True)
    primary_contact_phone = serializers.CharField(max_length=64, required=False, allow_blank=True)
    listings_enabled = serializers.BooleanField(required=False)
    extend_trial_days = serializers.IntegerField(required=False, min_value=1, max_value=365)
    trial_ends_at = serializers.DateTimeField(required=False)
    mark_subscription_active = serializers.BooleanField(required=False)

    def validate(self, attrs):
        extend_days = attrs.get("extend_trial_days")
        until = attrs.get("trial_ends_at")
        mark_active = attrs.get("mark_subscription_active")
        entitlement_ops = sum(
            1 for v in (extend_days is not None, until is not None, mark_active is True) if v
        )
        if entitlement_ops > 1:
            raise serializers.ValidationError(
                "Provide only one of extend_trial_days, trial_ends_at, or mark_subscription_active."
            )
        if until is not None and until <= timezone.now():
            raise serializers.ValidationError(
                {"trial_ends_at": "Trial end must be in the future."}
            )
        return attrs

    def update(self, instance, validated_data):
        extend_days = validated_data.pop("extend_trial_days", None)
        until = validated_data.pop("trial_ends_at", None)
        mark_active = validated_data.pop("mark_subscription_active", None)

        for key, value in validated_data.items():
            setattr(instance, key, value)
        if validated_data:
            instance.save()

        if mark_active:
            mark_subscription_active(instance)
        elif extend_days is not None:
            extend_trial(instance, days=extend_days)
        elif until is not None:
            extend_trial(instance, until=until)

        instance.refresh_from_db()
        return instance


class PlatformInviteOwnerSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate(self, attrs):
        tenant = self.context["tenant"]
        email = (attrs.get("email") or tenant.primary_contact_email or "").lower().strip()
        if not email:
            raise serializers.ValidationError({"email": "Owner email is required."})
        if Membership.objects.filter(tenant=tenant, user__email__iexact=email, is_active=True).exists():
            raise serializers.ValidationError({"email": "This person is already an active member."})
        attrs["email"] = email
        return attrs

    def create(self, validated_data):
        tenant = self.context["tenant"]
        email = validated_data["email"]
        pending = Invitation.objects.filter(
            tenant=tenant,
            email__iexact=email,
            accepted_at__isnull=True,
            revoked_at__isnull=True,
        ).first()
        if pending:
            pending.expires_at = timezone.now() + timedelta(days=INVITE_EXPIRY_DAYS)
            pending.role = Invitation.Role.ADMIN
            pending.save(update_fields=["expires_at", "role", "updated_at"])
            invitation = pending
        else:
            invitation = Invitation.objects.create(
                tenant=tenant,
                email=email,
                role=Invitation.Role.ADMIN,
                invited_by=self.context["request"].user,
            )
        from apps.tenants.tasks import send_member_invitation

        send_member_invitation.delay(invitation.id)
        return invitation


class PlatformOpsEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformOpsEvent
        fields = (
            "id",
            "actor_email",
            "action",
            "tenant_id",
            "tenant_slug",
            "metadata",
            "created_at",
        )


class PlatformTenantListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get_queryset(self):
        qs = Tenant.objects.annotate(
            member_count=Count("memberships", filter=Q(memberships__is_active=True))
        ).order_by("-created_at")
        q = (self.request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(slug__icontains=q))
        status_filter = (self.request.query_params.get("status") or "").strip()
        if status_filter in Tenant.Status.values:
            qs = qs.filter(status=status_filter)
        return qs

    def get_serializer_class(self):
        if self.request.method == "POST":
            return PlatformProvisionSerializer
        return PlatformTenantListSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        tenant = result.tenant
        log_platform_op(
            actor=request.user,
            action=PlatformOpsEvent.Action.PROVISION,
            tenant=tenant,
            metadata={
                "owner_email": (
                    result.user.email
                    if result.user
                    else (result.invitation.email if result.invitation else None)
                ),
                "invitation_id": result.invitation.id if result.invitation else None,
                "password_set": bool(result.user),
            },
        )
        detail = PlatformTenantDetailSerializer(tenant, context={"request": request})
        invite_url = None
        if result.invitation:
            invite_url = tenant.frontend_url(f"/invite/{result.invitation.token}")
        payload = {
            "tenant": detail.data,
            "invitation_id": result.invitation.id if result.invitation else None,
            "invite_url": invite_url,
            "workspace_url": tenant.frontend_url("/app"),
            "login_url": tenant.frontend_url("/login"),
            "owner_email": (
                result.user.email
                if result.user
                else (result.invitation.email if result.invitation else None)
            ),
            "invite_role": (
                result.invitation.role if result.invitation else Membership.Role.OWNER
            ),
        }
        return Response(payload, status=status.HTTP_201_CREATED)


class PlatformTenantDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated, IsAdminUser]
    queryset = Tenant.objects.all()
    http_method_names = ["get", "patch", "head", "options"]

    def get_serializer_class(self):
        if self.request.method == "PATCH":
            return PlatformTenantPatchSerializer
        return PlatformTenantDetailSerializer

    def patch(self, request, *args, **kwargs):
        tenant = self.get_object()
        previous_status = tenant.status
        previous_subscription = tenant.subscription_status
        previous_trial_end = tenant.trial_ends_at
        serializer = PlatformTenantPatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        validated = dict(serializer.validated_data)
        serializer.update(tenant, dict(validated))
        tenant.refresh_from_db()
        new_status = tenant.status
        fields = sorted(validated.keys())

        if validated.get("mark_subscription_active"):
            action = PlatformOpsEvent.Action.SUBSCRIPTION_ACTIVATED
            metadata = {"fields": fields}
        elif "extend_trial_days" in validated or "trial_ends_at" in validated:
            action = PlatformOpsEvent.Action.TRIAL_EXTENDED
            metadata = {
                "fields": fields,
                "previous_trial_ends_at": (
                    previous_trial_end.isoformat() if previous_trial_end else None
                ),
                "trial_ends_at": (
                    tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None
                ),
                "extend_trial_days": validated.get("extend_trial_days"),
                "previous_subscription_status": previous_subscription,
            }
        elif "status" in validated and new_status != previous_status:
            action = (
                PlatformOpsEvent.Action.SUSPEND
                if new_status == Tenant.Status.SUSPENDED
                else PlatformOpsEvent.Action.REACTIVATE
            )
            metadata = {"fields": fields}
        else:
            action = PlatformOpsEvent.Action.UPDATE
            metadata = {"fields": fields}

        log_platform_op(
            actor=request.user,
            action=action,
            tenant=tenant,
            metadata=metadata,
        )
        return Response(PlatformTenantDetailSerializer(tenant).data)


class PlatformInviteOwnerView(views.APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request, pk):
        try:
            tenant = Tenant.objects.get(pk=pk)
        except Tenant.DoesNotExist:
            return Response({"detail": "Tenant not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = PlatformInviteOwnerSerializer(
            data=request.data,
            context={"request": request, "tenant": tenant},
        )
        serializer.is_valid(raise_exception=True)
        invitation = serializer.save()
        log_platform_op(
            actor=request.user,
            action=PlatformOpsEvent.Action.INVITE,
            tenant=tenant,
            metadata={"email": invitation.email, "role": invitation.role, "invitation_id": invitation.id},
        )
        return Response(InvitationSerializer(invitation).data, status=status.HTTP_201_CREATED)


class PlatformTenantInvitationsView(views.APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request, pk):
        try:
            tenant = Tenant.objects.get(pk=pk)
        except Tenant.DoesNotExist:
            return Response({"detail": "Tenant not found."}, status=status.HTTP_404_NOT_FOUND)
        qs = tenant.invitations.filter(accepted_at__isnull=True, revoked_at__isnull=True).order_by(
            "-created_at"
        )
        return Response(InvitationSerializer(qs, many=True).data)


class PlatformInvitationResendView(views.APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request, pk, invite_id):
        try:
            invitation = Invitation.objects.select_related("tenant").get(
                pk=invite_id,
                tenant_id=pk,
                accepted_at__isnull=True,
                revoked_at__isnull=True,
            )
        except Invitation.DoesNotExist:
            return Response({"detail": "Invitation not found."}, status=status.HTTP_404_NOT_FOUND)
        if invitation.is_expired:
            invitation.expires_at = timezone.now() + timedelta(days=INVITE_EXPIRY_DAYS)
            invitation.save(update_fields=["expires_at", "updated_at"])
        from apps.tenants.tasks import send_member_invitation

        send_member_invitation.delay(invitation.id)
        invitation.refresh_from_db()
        log_platform_op(
            actor=request.user,
            action=PlatformOpsEvent.Action.INVITE_RESEND,
            tenant=invitation.tenant,
            metadata={"email": invitation.email, "invitation_id": invitation.id},
        )
        return Response(InvitationSerializer(invitation).data)


class PlatformInvitationRevokeView(views.APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def delete(self, request, pk, invite_id):
        try:
            invitation = Invitation.objects.select_related("tenant").get(
                pk=invite_id,
                tenant_id=pk,
                accepted_at__isnull=True,
                revoked_at__isnull=True,
            )
        except Invitation.DoesNotExist:
            return Response({"detail": "Invitation not found."}, status=status.HTTP_404_NOT_FOUND)
        invitation.revoked_at = timezone.now()
        invitation.save(update_fields=["revoked_at", "updated_at"])
        log_platform_op(
            actor=request.user,
            action=PlatformOpsEvent.Action.INVITE_REVOKE,
            tenant=invitation.tenant,
            metadata={"email": invitation.email, "invitation_id": invitation.id},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlatformDemoResetView(views.APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request):
        owner_email = (request.data.get("owner_email") or "").strip() or None
        owner_password = (request.data.get("owner_password") or "").strip() or None
        try:
            result = reset_demo_tenant(
                owner_email=owner_email,
                owner_password=owner_password,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if result.tenant.slug != DEMO_SLUG:
            return Response(
                {"detail": "Demo reset refused for non-demo tenant."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        log_platform_op(
            actor=request.user,
            action=PlatformOpsEvent.Action.DEMO_RESET,
            tenant=result.tenant,
            metadata={"owner_email": result.owner_email, "password_set": result.password_set},
        )
        return Response(
            {
                "tenant": PlatformTenantDetailSerializer(result.tenant).data,
                "owner_email": result.owner_email,
                "password_set": result.password_set,
                "login_url": result.tenant.frontend_url("/login"),
                "workspace_url": result.tenant.frontend_url("/app"),
            }
        )


class PlatformMeView(views.APIView):
    """Staff session check on apex (no tenant required)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response(
            {
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "full_name": user.full_name,
                    "is_staff": user.is_staff,
                }
            }
        )


class PlatformHealthView(views.APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        checks: dict[str, str] = {"database": "ok", "redis": "ok"}
        overall = "ok"
        try:
            connection.ensure_connection()
        except Exception as exc:  # noqa: BLE001
            checks["database"] = f"error: {exc.__class__.__name__}"
            overall = "degraded"
        try:
            import redis

            client = redis.from_url(settings.CELERY_BROKER_URL)
            if client.ping() is not True:
                raise RuntimeError("ping failed")
        except Exception as exc:  # noqa: BLE001
            checks["redis"] = f"error: {exc.__class__.__name__}"
            overall = "degraded"

        base_domain = settings.BASE_DOMAIN
        frontend_protocol = settings.FRONTEND_PROTOCOL
        api_protocol = getattr(settings, "API_PROTOCOL", frontend_protocol)
        warnings: list[str] = []
        if not base_domain:
            warnings.append("BASE_DOMAIN is empty — signing and invite links will break.")
        if frontend_protocol not in ("http", "https"):
            warnings.append(f"FRONTEND_PROTOCOL is unusual: {frontend_protocol!r}")
        if api_protocol != frontend_protocol:
            warnings.append(
                f"API_PROTOCOL ({api_protocol}) differs from FRONTEND_PROTOCOL "
                f"({frontend_protocol}) — confirm signing hosts match DNS."
            )
        if settings.DEBUG and base_domain and not str(base_domain).endswith(".test"):
            warnings.append(
                "DEBUG is on but BASE_DOMAIN does not end with .test — "
                "partner signing links may point at the wrong host."
            )

        demo = Tenant.objects.filter(slug=DEMO_SLUG).first()
        return Response(
            {
                "status": overall,
                "service": "signdesk-api",
                "checks": checks,
                "config": {
                    "base_domain": base_domain,
                    "frontend_protocol": frontend_protocol,
                    "api_protocol": api_protocol,
                    "frontend_port": settings.FRONTEND_PORT or "",
                    "debug": settings.DEBUG,
                    "celery_task_always_eager": getattr(
                        settings, "CELERY_TASK_ALWAYS_EAGER", False
                    ),
                },
                "warnings": warnings,
                "demo_tenant": {
                    "exists": demo is not None,
                    "status": demo.status if demo else None,
                    "login_url": demo.frontend_url("/login") if demo else None,
                },
                "example_signing_host": (
                    f"{frontend_protocol}://demo.{base_domain}"
                    + (
                        f":{settings.FRONTEND_PORT}"
                        if settings.FRONTEND_PORT
                        and (
                            base_domain in ("localhost", "127.0.0.1")
                            or str(base_domain).endswith(".test")
                        )
                        else ""
                    )
                    + "/sign/…"
                ),
            }
        )


class PlatformMediaOrphansView(views.APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        prefixes = self._parse_prefixes(request.query_params.getlist("prefix"))
        limit = int(request.query_params.get("limit") or 50)
        inventory = build_media_inventory(prefixes=prefixes)
        orphans = sorted(inventory.orphans)
        missing = sorted(inventory.missing)
        show_limit = None if limit == 0 else limit
        log_platform_op(
            actor=request.user,
            action=PlatformOpsEvent.Action.MEDIA_AUDIT,
            metadata={
                "orphan_count": len(orphans),
                "missing_count": len(missing),
                "prefixes": list(prefixes) if prefixes else list(MEDIA_PREFIXES),
            },
        )
        return Response(
            {
                "referenced": len(inventory.referenced),
                "on_disk": len(inventory.on_disk),
                "orphan_count": len(orphans),
                "missing_count": len(missing),
                "orphans": orphans if show_limit is None else orphans[:show_limit],
                "missing": missing if show_limit is None else missing[:show_limit],
                "prefixes": [p.rstrip("/") for p in (prefixes or MEDIA_PREFIXES)],
                "dry_run": True,
            }
        )

    def post(self, request):
        confirm = (request.data.get("confirm") or "").strip()
        if confirm != MEDIA_DELETE_CONFIRM:
            return Response(
                {
                    "detail": f'Type "{MEDIA_DELETE_CONFIRM}" to confirm deletion.',
                    "required_confirm": MEDIA_DELETE_CONFIRM,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        prefixes = self._parse_prefixes(request.data.get("prefixes") or [])
        inventory = build_media_inventory(prefixes=prefixes)
        orphans = inventory.orphans
        if not orphans:
            return Response({"deleted": 0, "errors": [], "orphan_count": 0})
        deleted, errors = delete_orphan_files(set(orphans))
        log_platform_op(
            actor=request.user,
            action=PlatformOpsEvent.Action.MEDIA_DELETE,
            metadata={"deleted": deleted, "error_count": len(errors), "orphan_count": len(orphans)},
        )
        return Response(
            {
                "deleted": deleted,
                "errors": errors,
                "orphan_count": len(orphans),
            }
        )

    @staticmethod
    def _parse_prefixes(raw) -> tuple[str, ...] | None:
        if not raw:
            return None
        allowed = {p.rstrip("/") for p in MEDIA_PREFIXES}
        cleaned = []
        for item in raw:
            value = str(item).rstrip("/")
            if value in allowed:
                cleaned.append(f"{value}/")
        return tuple(cleaned) or None


class PlatformSeedFormLibraryView(views.APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request, pk):
        try:
            tenant = Tenant.objects.get(pk=pk)
        except Tenant.DoesNotExist:
            return Response({"detail": "Tenant not found."}, status=status.HTTP_404_NOT_FOUND)
        replace = bool(request.data.get("replace"))
        from apps.documents.form_library.ensure import ensure_form_library

        stats = ensure_form_library(tenant, replace=replace)
        log_platform_op(
            actor=request.user,
            action=PlatformOpsEvent.Action.FORM_SEED,
            tenant=tenant,
            metadata={"replace": replace, **stats},
        )
        return Response({"tenant_id": tenant.id, "slug": tenant.slug, "replace": replace, **stats})


class PlatformSupportSnapshotView(views.APIView):
    """Read-only support diagnostics (no impersonation)."""

    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request, pk):
        try:
            tenant = Tenant.objects.get(pk=pk)
        except Tenant.DoesNotExist:
            return Response({"detail": "Tenant not found."}, status=status.HTTP_404_NOT_FOUND)

        from apps.envelopes.models import Envelope

        envelope_counts = {
            row["status"]: row["c"]
            for row in Envelope.objects.filter(tenant=tenant)
            .values("status")
            .annotate(c=Count("id"))
        }
        pending_invites = tenant.invitations.filter(
            accepted_at__isnull=True, revoked_at__isnull=True
        ).order_by("-created_at")[:10]
        last_invite = tenant.invitations.order_by("-created_at").first()
        members = tenant.memberships.filter(is_active=True).select_related("user")

        log_platform_op(
            actor=request.user,
            action=PlatformOpsEvent.Action.SUPPORT_SNAPSHOT,
            tenant=tenant,
            metadata={},
        )

        return Response(
            {
                "tenant": PlatformTenantDetailSerializer(tenant).data,
                "envelope_counts": envelope_counts,
                "envelope_total": sum(envelope_counts.values()),
                "pending_invitations": InvitationSerializer(pending_invites, many=True).data,
                "last_invitation": InvitationSerializer(last_invite).data if last_invite else None,
                "active_member_count": members.count(),
                "members": MembershipSerializer(members, many=True).data,
                "workspace_url": tenant.frontend_url("/app"),
                "login_url": tenant.frontend_url("/login"),
                "note": (
                    "Read-only support snapshot. Sign in to the workspace with partner "
                    "credentials if interactive debugging is required; actions are audited."
                ),
            }
        )


class PlatformOpsEventListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsAdminUser]
    serializer_class = PlatformOpsEventSerializer
    pagination_class = None

    def get_queryset(self):
        qs = PlatformOpsEvent.objects.all().order_by("-created_at")
        tenant_id = self.request.query_params.get("tenant")
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        action = (self.request.query_params.get("action") or "").strip()
        if action:
            qs = qs.filter(action=action)
        slug = (self.request.query_params.get("slug") or "").strip()
        if slug:
            qs = qs.filter(tenant_slug__iexact=slug)
        return qs[:200]
