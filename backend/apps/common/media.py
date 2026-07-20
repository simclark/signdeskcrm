"""Protected media serving — avoid open /media/ exposure in production."""

from __future__ import annotations

import mimetypes
import os
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.documents.models import DocumentVersion
from apps.envelopes.models import Envelope, SignatureAsset
from apps.tenants.models import Membership, Tenant

PUBLIC_MEDIA_PREFIXES = ("tenant_logos/", "tenant_icons/")


def protected_media_url(request, file_field) -> str | None:
    """Build an absolute URL that goes through /api/media/ (auth-gated)."""
    if not file_field or not getattr(file_field, "name", None):
        return None
    if request:
        return request.build_absolute_uri(f"/api/media/{file_field.name}")
    return f"/api/media/{file_field.name}"


def _safe_media_path(relative: str) -> Path:
    relative = (relative or "").lstrip("/")
    if not relative or ".." in relative.split("/"):
        raise Http404("Invalid path.")
    root = Path(settings.MEDIA_ROOT).resolve()
    full = (root / relative).resolve()
    if not str(full).startswith(str(root) + os.sep) and full != root:
        raise Http404("Invalid path.")
    if not full.is_file():
        raise Http404("Not found.")
    return full


def _tenant_owns_path(tenant: Tenant, relative: str) -> bool:
    if DocumentVersion.objects.filter(tenant=tenant, file=relative).exists():
        return True
    if Envelope.objects.filter(tenant=tenant, signed_file=relative).exists():
        return True
    if Envelope.objects.filter(tenant=tenant, certificate_file=relative).exists():
        return True
    if SignatureAsset.objects.filter(tenant=tenant, image=relative).exists():
        return True
    if tenant.logo and tenant.logo.name == relative:
        return True
    if tenant.icon and tenant.icon.name == relative:
        return True
    return False


def _file_response(full: Path) -> FileResponse:
    content_type, _ = mimetypes.guess_type(str(full))
    return FileResponse(
        full.open("rb"),
        content_type=content_type or "application/octet-stream",
        as_attachment=False,
        filename=full.name,
    )


class ProtectedMediaView(APIView):
    """
    Serve MEDIA_ROOT files.

    - tenant_logos / tenant_icons: public (signing UI branding)
    - everything else: JWT + active tenant membership + ownership check
    """

    permission_classes = [AllowAny]

    def get(self, request, path: str):
        relative = path.lstrip("/")
        full = _safe_media_path(relative)

        if relative.startswith(PUBLIC_MEDIA_PREFIXES):
            return _file_response(full)

        if not request.user or not request.user.is_authenticated:
            raise NotAuthenticated()

        tenant = getattr(request, "tenant", None)
        if tenant is None:
            raise PermissionDenied("Tenant required.")

        is_member = Membership.objects.filter(
            tenant=tenant, user=request.user, is_active=True
        ).exists()
        if not is_member:
            raise PermissionDenied("You must be a member of this workspace.")

        if not _tenant_owns_path(tenant, relative):
            raise Http404("Not found.")

        return _file_response(full)
