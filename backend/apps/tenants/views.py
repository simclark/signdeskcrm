from django.contrib.auth import get_user_model
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import generics, status, views
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.accounts.serializers import EmailTokenObtainPairSerializer
from apps.tenants.models import (
    INVITE_EXPIRY_DAYS,
    EmailTemplate,
    Invitation,
    Membership,
    Tenant,
    ensure_email_templates,
)
from apps.tenants.permissions import IsTenantAdmin, IsTenantMember
from apps.tenants.serializers import (
    AcceptInvitationSerializer,
    CreateInvitationSerializer,
    EmailTemplateSerializer,
    EmailTemplateUpdateSerializer,
    InvitationSerializer,
    MembershipSerializer,
    MembershipUpdateSerializer,
    SignupSerializer,
    TenantSerializer,
)
from apps.tenants.esign_disclosure import DEFAULT_ESIGN_ACKNOWLEDGEMENT
from apps.tenants.email_templates import EmailTemplateKey, get_default

User = get_user_model()


class SignupThrottle(ScopedRateThrottle):
    scope = "signup"


class LoginThrottle(ScopedRateThrottle):
    scope = "login"


class SignupView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = SignupSerializer
    throttle_classes = [SignupThrottle]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        tenant = result["tenant"]
        user = result["user"]
        from apps.accounts.services import issue_password_reset

        issue_password_reset(user=user, tenant=tenant)
        return Response(
            {
                "detail": (
                    "Check your email to confirm your address and set a password "
                    "for your new workspace."
                ),
                "email": user.email,
                "tenant": TenantSerializer(tenant).data,
                "redirect_host": tenant.host(),
            },
            status=status.HTTP_201_CREATED,
        )


class SuggestSlugView(views.APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        from django.core.exceptions import ValidationError

        from apps.tenants.models import RESERVED_SLUGS, validate_tenant_slug

        name = request.query_params.get("name", "")
        base = slugify(name) or "workspace"
        if len(base) < 2:
            base = "workspace"
        base = base[:63]
        candidate = base
        i = 1
        while i <= 100:
            try:
                validate_tenant_slug(candidate)
            except ValidationError:
                candidate = f"{base[:55]}-{i}"
                i += 1
                continue
            if candidate in RESERVED_SLUGS or Tenant.objects.filter(slug=candidate).exists():
                candidate = f"{base[:55]}-{i}"
                i += 1
                continue
            break
        return Response({"slug": candidate})


class SlugCheckView(views.APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        from apps.tenants.models import RESERVED_SLUGS
        from apps.tenants.serializers import SlugAvailabilitySerializer

        serializer = SlugAvailabilitySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        slug = serializer.validated_data["slug"]
        exists = Tenant.objects.filter(slug=slug).exists()
        # Reserved names are never claimable, even when no tenant row exists yet.
        available = not exists and slug not in RESERVED_SLUGS
        suggested = slug
        if not available:
            base = slug
            i = 2
            while Tenant.objects.filter(slug=f"{base}-{i}").exists() or f"{base}-{i}" in RESERVED_SLUGS:
                i += 1
            suggested = f"{base}-{i}"
        return Response(
            {
                "slug": slug,
                "available": available,
                "exists": exists,
                "suggested": suggested,
            }
        )


class TenantMeView(views.APIView):
    permission_classes = [IsAuthenticated, IsTenantMember]

    def get(self, request):
        membership = Membership.objects.get(
            tenant=request.tenant, user=request.user, is_active=True
        )
        return Response(
            {
                "tenant": TenantSerializer(request.tenant, context={"request": request}).data,
                "membership": MembershipSerializer(membership).data,
                "user": {
                    "id": request.user.id,
                    "email": request.user.email,
                    "first_name": request.user.first_name,
                    "last_name": request.user.last_name,
                    "full_name": request.user.full_name,
                    "is_staff": request.user.is_staff,
                },
            }
        )


class TenantSettingsView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated, IsTenantAdmin]
    serializer_class = TenantSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_object(self):
        return self.request.tenant


class RestoreEsignAcknowledgementView(views.APIView):
    """Restore the workspace ESIGN/UETA disclosure to the platform default."""

    permission_classes = [IsAuthenticated, IsTenantAdmin]

    def post(self, request):
        tenant = request.tenant
        tenant.esign_acknowledgement = DEFAULT_ESIGN_ACKNOWLEDGEMENT
        tenant.esign_acknowledgement_version = timezone.now().strftime("%Y-%m-%d")
        tenant.save(
            update_fields=[
                "esign_acknowledgement",
                "esign_acknowledgement_version",
                "updated_at",
            ]
        )
        return Response(TenantSerializer(tenant, context={"request": request}).data)


class EmailTemplateListView(views.APIView):
    permission_classes = [IsAuthenticated, IsTenantAdmin]

    def get(self, request):
        ensure_email_templates(request.tenant)
        templates = EmailTemplate.objects.filter(
            tenant=request.tenant, key__in=EmailTemplateKey.ALL
        )
        by_key = {row.key: row for row in templates}
        ordered = [by_key[key] for key in EmailTemplateKey.ALL if key in by_key]
        return Response(EmailTemplateSerializer(ordered, many=True).data)


class EmailTemplateDetailView(views.APIView):
    permission_classes = [IsAuthenticated, IsTenantAdmin]

    def _get_template(self, request, key: str):
        if key not in EmailTemplateKey.ALL:
            return None
        ensure_email_templates(request.tenant)
        try:
            return EmailTemplate.objects.get(tenant=request.tenant, key=key)
        except EmailTemplate.DoesNotExist:
            return None

    def get(self, request, key: str):
        template = self._get_template(request, key)
        if template is None:
            return Response({"detail": "Email template not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(EmailTemplateSerializer(template).data)

    def patch(self, request, key: str):
        template = self._get_template(request, key)
        if template is None:
            return Response({"detail": "Email template not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = EmailTemplateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        template.subject = serializer.validated_data["subject"]
        template.body = serializer.validated_data["body"]
        template.save(update_fields=["subject", "body", "updated_at"])
        return Response(EmailTemplateSerializer(template).data)


class EmailTemplateRestoreView(views.APIView):
    permission_classes = [IsAuthenticated, IsTenantAdmin]

    def post(self, request, key: str):
        if key not in EmailTemplateKey.ALL:
            return Response({"detail": "Email template not found."}, status=status.HTTP_404_NOT_FOUND)
        ensure_email_templates(request.tenant)
        default = get_default(key)
        template, _ = EmailTemplate.objects.update_or_create(
            tenant=request.tenant,
            key=key,
            defaults={"subject": default["subject"], "body": default["body"]},
        )
        return Response(EmailTemplateSerializer(template).data)


class MembershipListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsTenantMember]
    serializer_class = MembershipSerializer

    def get_queryset(self):
        return (
            Membership.objects.filter(tenant=self.request.tenant)
            .select_related("user")
            .order_by("-is_active", "user__email")
        )


class MembershipUpdateView(views.APIView):
    """Change role (admin/member) or soft-deactivate a membership."""

    permission_classes = [IsAuthenticated, IsTenantAdmin]

    def patch(self, request, pk):
        try:
            membership = Membership.objects.select_related("user").get(
                pk=pk, tenant=request.tenant
            )
        except Membership.DoesNotExist:
            return Response({"detail": "Member not found."}, status=status.HTTP_404_NOT_FOUND)

        actor = Membership.objects.get(
            tenant=request.tenant, user=request.user, is_active=True
        )
        serializer = MembershipUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if membership.role == Membership.Role.OWNER:
            if "role" in data and data["role"] != Membership.Role.OWNER:
                return Response(
                    {"detail": "Cannot change the owner role via this endpoint."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if data.get("is_active") is False:
                active_owners = Membership.objects.filter(
                    tenant=request.tenant,
                    role=Membership.Role.OWNER,
                    is_active=True,
                ).count()
                if active_owners <= 1:
                    return Response(
                        {"detail": "Cannot deactivate the sole owner."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        if actor.role == Membership.Role.ADMIN and membership.role == Membership.Role.OWNER:
            return Response(
                {"detail": "Admins cannot change the owner."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if membership.user_id == request.user.id and data.get("is_active") is False:
            return Response(
                {"detail": "You cannot deactivate yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if membership.user_id == request.user.id and "role" in data:
            return Response(
                {"detail": "You cannot change your own role."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        update_fields = ["updated_at"]
        if "role" in data:
            membership.role = data["role"]
            update_fields.append("role")
        if "is_active" in data:
            membership.is_active = data["is_active"]
            update_fields.append("is_active")
        membership.save(update_fields=update_fields)
        return Response(MembershipSerializer(membership).data)


class MembershipSendPasswordResetView(views.APIView):
    """Admin/owner: email a password-reset link to an active member."""

    permission_classes = [IsAuthenticated, IsTenantAdmin]

    def post(self, request, pk):
        try:
            membership = Membership.objects.select_related("user").get(
                pk=pk, tenant=request.tenant
            )
        except Membership.DoesNotExist:
            return Response({"detail": "Member not found."}, status=status.HTTP_404_NOT_FOUND)

        actor = Membership.objects.get(
            tenant=request.tenant, user=request.user, is_active=True
        )
        if actor.role == Membership.Role.ADMIN and membership.role == Membership.Role.OWNER:
            return Response(
                {"detail": "Admins cannot reset the owner's password."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not membership.is_active:
            return Response(
                {"detail": "Cannot send a password reset to a deactivated member."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not membership.user.is_active:
            return Response(
                {"detail": "Cannot send a password reset to an inactive account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.accounts.services import issue_password_reset

        issue_password_reset(user=membership.user, tenant=request.tenant)
        return Response(
            {"detail": "Password reset email sent."},
            status=status.HTTP_200_OK,
        )


class InvitationListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsTenantAdmin]

    def get_queryset(self):
        return Invitation.objects.filter(
            tenant=self.request.tenant,
            accepted_at__isnull=True,
            revoked_at__isnull=True,
        ).select_related("invited_by")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return CreateInvitationSerializer
        return InvitationSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["tenant"] = self.request.tenant
        return ctx

    def create(self, request, *args, **kwargs):
        from apps.tenants.plans import assert_seat_available

        assert_seat_available(request.tenant)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invitation = serializer.save()
        return Response(
            InvitationSerializer(invitation).data,
            status=status.HTTP_201_CREATED,
        )


class InvitationRevokeView(views.APIView):
    permission_classes = [IsAuthenticated, IsTenantAdmin]

    def delete(self, request, pk):
        try:
            invitation = Invitation.objects.get(
                pk=pk,
                tenant=request.tenant,
                accepted_at__isnull=True,
                revoked_at__isnull=True,
            )
        except Invitation.DoesNotExist:
            return Response({"detail": "Invitation not found."}, status=status.HTTP_404_NOT_FOUND)
        invitation.revoked_at = timezone.now()
        invitation.save(update_fields=["revoked_at", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class InvitationResendView(views.APIView):
    permission_classes = [IsAuthenticated, IsTenantAdmin]

    def post(self, request, pk):
        try:
            invitation = Invitation.objects.get(
                pk=pk,
                tenant=request.tenant,
                accepted_at__isnull=True,
                revoked_at__isnull=True,
            )
        except Invitation.DoesNotExist:
            return Response({"detail": "Invitation not found."}, status=status.HTTP_404_NOT_FOUND)
        if invitation.is_expired:
            from datetime import timedelta

            invitation.expires_at = timezone.now() + timedelta(days=INVITE_EXPIRY_DAYS)
            invitation.save(update_fields=["expires_at", "updated_at"])
        from apps.tenants.tasks import send_member_invitation

        send_member_invitation.delay(invitation.id)
        invitation.refresh_from_db()
        return Response(InvitationSerializer(invitation).data)


class InvitationDetailView(views.APIView):
    permission_classes = [AllowAny]
    throttle_classes = [SignupThrottle]

    def get(self, request, token):
        try:
            invitation = Invitation.objects.select_related("tenant").get(token=token)
        except Invitation.DoesNotExist:
            return Response({"detail": "Invitation not found."}, status=status.HTTP_404_NOT_FOUND)
        if not invitation.is_usable:
            return Response(
                {"detail": "This invitation has expired or is no longer valid."},
                status=status.HTTP_410_GONE,
            )
        user_exists = User.objects.filter(email__iexact=invitation.email).exists()
        return Response(
            {
                "email": invitation.email,
                "role": invitation.role,
                "tenant_name": invitation.tenant.name,
                "tenant_slug": invitation.tenant.slug,
                "expires_at": invitation.expires_at,
                "user_exists": user_exists,
            }
        )


class AcceptInvitationView(views.APIView):
    permission_classes = [AllowAny]
    throttle_classes = [SignupThrottle]

    def post(self, request, token):
        try:
            invitation = Invitation.objects.select_related("tenant").get(token=token)
        except Invitation.DoesNotExist:
            return Response({"detail": "Invitation not found."}, status=status.HTTP_404_NOT_FOUND)
        if not invitation.is_usable:
            return Response(
                {"detail": "This invitation has expired or is no longer valid."},
                status=status.HTTP_410_GONE,
            )
        from apps.tenants.plans import assert_seat_available

        try:
            assert_seat_available(invitation.tenant)
        except Exception as exc:
            from rest_framework.exceptions import ValidationError

            if isinstance(exc, ValidationError):
                return Response(exc.detail, status=status.HTTP_402_PAYMENT_REQUIRED)
            raise
        serializer = AcceptInvitationSerializer(
            data=request.data,
            context={"invitation": invitation, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        user = result["user"]
        tenant = result["tenant"]
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "tenant": TenantSerializer(tenant, context={"request": request}).data,
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "full_name": user.full_name,
                },
                "tokens": {
                    "refresh": str(refresh),
                    "access": str(refresh.access_token),
                },
                "redirect_host": tenant.host(),
            },
            status=status.HTTP_201_CREATED,
        )


class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [LoginThrottle]
    permission_classes = [AllowAny]
    serializer_class = EmailTokenObtainPairSerializer
