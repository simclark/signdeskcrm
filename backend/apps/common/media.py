"""Protected media serving — avoid open /media/ exposure in production."""

from __future__ import annotations

import mimetypes
import os

from django.core.files.storage import default_storage
from django.db.models import Q
from django.http import FileResponse, Http404
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.documents.models import DocumentVersion
from apps.envelopes.models import Envelope, SignatureAsset
from apps.tenants.models import Membership, Tenant

PUBLIC_MEDIA_PREFIXES = ("tenant_logos/", "tenant_icons/")


def _is_public_branding(relative: str) -> bool:
    """Logos/icons are public for the signing UI (legacy + tenant-prefixed)."""
    if relative.startswith(PUBLIC_MEDIA_PREFIXES):
        return True
    parts = relative.split("/")
    # tenants/<id>/branding/<logo|icon>/...
    if (
        len(parts) >= 4
        and parts[0] == "tenants"
        and parts[2] == "branding"
        and parts[3] in ("logo", "icon")
    ):
        return Tenant.objects.filter(Q(logo=relative) | Q(icon=relative)).exists()
    return False


def protected_media_url(request, file_field) -> str | None:
    """Build an absolute URL that goes through /api/media/ (auth-gated)."""
    if not file_field or not getattr(file_field, "name", None):
        return None
    if request:
        return request.build_absolute_uri(f"/api/media/{file_field.name}")
    return f"/api/media/{file_field.name}"


def _safe_media_name(relative: str) -> str:
    relative = (relative or "").lstrip("/")
    if not relative or ".." in relative.split("/"):
        raise Http404("Invalid path.")
    if not default_storage.exists(relative):
        raise Http404("Not found.")
    return relative


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


def _file_response(relative: str) -> FileResponse:
    content_type, _ = mimetypes.guess_type(relative)
    fh = default_storage.open(relative, "rb")
    return FileResponse(
        fh,
        content_type=content_type or "application/octet-stream",
        as_attachment=False,
        filename=os.path.basename(relative),
    )


class ProtectedMediaView(APIView):
    """
    Serve stored media files (local MEDIA_ROOT or Spaces).

    - tenant branding (legacy tenant_logos/icons or tenants/*/branding/*): public
    - everything else: JWT + active tenant membership + ownership check
    """

    permission_classes = [AllowAny]

    def get(self, request, path: str):
        relative = _safe_media_name(path.lstrip("/"))

        if _is_public_branding(relative):
            return _file_response(relative)

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

        return _file_response(relative)
