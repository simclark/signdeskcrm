from django.contrib.auth import get_user_model
from django.utils.text import slugify
from rest_framework import generics, status, views
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.accounts.serializers import EmailTokenObtainPairSerializer
from apps.tenants.models import Membership, Tenant
from apps.tenants.permissions import IsTenantAdmin, IsTenantMember
from apps.tenants.serializers import (
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
                "tenant": TenantSerializer(request.tenant).data,
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

    def get_object(self):
        return self.request.tenant


class MembershipListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsTenantMember]
    serializer_class = MembershipSerializer

    def get_queryset(self):
        return Membership.objects.filter(tenant=self.request.tenant, is_active=True)


class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [LoginThrottle]
    permission_classes = [AllowAny]
    serializer_class = EmailTokenObtainPairSerializer
