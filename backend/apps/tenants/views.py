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
from apps.tenants.models import INVITE_EXPIRY_DAYS, Invitation, Membership, Tenant
from apps.tenants.permissions import IsTenantAdmin, IsTenantMember
from apps.tenants.serializers import (
    AcceptInvitationSerializer,
    CreateInvitationSerializer,
    InvitationSerializer,
    MembershipSerializer,
    SignupSerializer,
    TenantSerializer,
)

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
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "tenant": TenantSerializer(tenant).data,
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
        from apps.tenants.serializers import SlugAvailabilitySerializer

        serializer = SlugAvailabilitySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        slug = serializer.validated_data["slug"]
        available = not Tenant.objects.filter(slug=slug).exists()
        suggested = slug
        if not available:
            base = slug
            i = 2
            while Tenant.objects.filter(slug=f"{base}-{i}").exists():
                i += 1
            suggested = f"{base}-{i}"
        return Response({"slug": slug, "available": available, "suggested": suggested})


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
                },
            }
        )


class TenantSettingsView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated, IsTenantAdmin]
    serializer_class = TenantSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_object(self):
        return self.request.tenant


class MembershipListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsTenantMember]
    serializer_class = MembershipSerializer

    def get_queryset(self):
        return Membership.objects.filter(tenant=self.request.tenant, is_active=True)


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
