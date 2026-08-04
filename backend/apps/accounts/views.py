from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import PasswordResetToken
from apps.accounts.serializers import (
    ChangePasswordSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileSerializer,
)


class PasswordResetThrottle(ScopedRateThrottle):
    scope = "password_reset"


class ProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ProfileSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"ok": True}, status=status.HTTP_200_OK)


def _password_reset_host_allowed(request, reset: PasswordResetToken) -> bool:
    """Platform tokens only on platform host; tenant tokens only on that workspace."""
    if reset.is_platform:
        return bool(getattr(request, "is_platform", False))
    tenant = getattr(request, "tenant", None)
    return tenant is not None and tenant.id == reset.tenant_id


class PasswordResetRequestView(APIView):
    """Request a password-reset email for platform staff or a tenant member."""

    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetThrottle]

    def post(self, request):
        if getattr(request, "is_platform", False):
            serializer = PasswordResetRequestSerializer(
                data=request.data,
                context={"platform": True, "request": request},
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(
                {
                    "detail": (
                        "If a staff account with that email exists, "
                        "a password reset link has been sent."
                    )
                },
                status=status.HTTP_200_OK,
            )

        tenant = getattr(request, "tenant", None)
        if tenant is None:
            return Response(
                {"detail": "Password reset must be requested from a workspace subdomain."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = PasswordResetRequestSerializer(
            data=request.data,
            context={"tenant": tenant, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {
                "detail": (
                    "If an account with that email exists in this workspace, "
                    "a password reset link has been sent."
                )
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetDetailView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetThrottle]

    def get(self, request, token):
        try:
            reset = PasswordResetToken.objects.select_related("user", "tenant").get(token=token)
        except PasswordResetToken.DoesNotExist:
            return Response({"detail": "Reset link not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _password_reset_host_allowed(request, reset):
            return Response({"detail": "Reset link not found."}, status=status.HTTP_404_NOT_FOUND)
        if not reset.is_usable:
            return Response(
                {"detail": "This reset link has expired or is no longer valid."},
                status=status.HTTP_410_GONE,
            )
        if reset.is_platform:
            return Response(
                {
                    "email": reset.user.email,
                    "tenant_name": "SignDesk Platform",
                    "tenant_slug": None,
                    "is_platform": True,
                    "is_setup": False,
                    "expires_at": reset.expires_at,
                }
            )
        return Response(
            {
                "email": reset.user.email,
                "tenant_name": reset.tenant.name,
                "tenant_slug": reset.tenant.slug,
                "is_platform": False,
                "is_setup": not reset.user.has_usable_password(),
                "expires_at": reset.expires_at,
            }
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetThrottle]

    def post(self, request, token):
        try:
            reset = PasswordResetToken.objects.select_related("user", "tenant").get(token=token)
        except PasswordResetToken.DoesNotExist:
            return Response({"detail": "Reset link not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _password_reset_host_allowed(request, reset):
            return Response({"detail": "Reset link not found."}, status=status.HTTP_404_NOT_FOUND)
        if not reset.is_usable:
            return Response(
                {"detail": "This reset link has expired or is no longer valid."},
                status=status.HTTP_410_GONE,
            )
        is_setup = not reset.user.has_usable_password() and not reset.is_platform
        serializer = PasswordResetConfirmSerializer(
            data=request.data,
            context={"reset": reset, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        payload: dict = {"ok": True, "is_setup": is_setup}
        if is_setup and reset.tenant_id:
            from rest_framework_simplejwt.tokens import RefreshToken

            refresh = RefreshToken.for_user(user)
            payload["tokens"] = {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            }
            payload["redirect_host"] = reset.tenant.host()
        return Response(payload, status=status.HTTP_200_OK)
