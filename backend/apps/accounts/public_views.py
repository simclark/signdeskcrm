from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError

from apps.accounts.tokens import blacklist_refresh_token


class LogoutView(APIView):
    """Blacklist the refresh token so it cannot be reused."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        raw = request.data.get("refresh")
        if not raw:
            return Response(
                {"detail": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            blacklist_refresh_token(raw)
        except TokenError:
            # Still succeed — client clears tokens; token may already be expired.
            return Response({"ok": True}, status=status.HTTP_200_OK)
        return Response({"ok": True}, status=status.HTTP_200_OK)


class PublicConfigView(APIView):
    """Unauthenticated product config for marketing / trial UX."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, _request):
        return Response(
            {
                "support_email": getattr(
                    settings, "SUPPORT_EMAIL", "support@signdeskcrm.com"
                ),
                "billing_portal_available": bool(
                    getattr(settings, "BILLING_PORTAL_AVAILABLE", False)
                ),
            }
        )
