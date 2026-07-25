"""Storage-agnostic helpers for FileFields (local disk or S3/Spaces)."""

from __future__ import annotations

import io
import os
from typing import BinaryIO

from django.conf import settings
from django.core.files.storage import default_storage


def read_field_bytes(field_file) -> bytes:
    """Read a FieldFile fully into memory (works for local and remote storage)."""
    field_file.open("rb")
    try:
        return field_file.read()
    finally:
        field_file.close()


def field_file_stream(field_file) -> BinaryIO:
    """Return a seekable BytesIO of FieldFile contents."""
    return io.BytesIO(read_field_bytes(field_file))


def storage_open(name: str) -> BinaryIO:
    """Open a stored object by relative name; returns a seekable BytesIO."""
    with default_storage.open(name, "rb") as fh:
        return io.BytesIO(fh.read())


def storage_exists(name: str) -> bool:
    if not name:
        return False
    try:
        return default_storage.exists(name)
    except Exception:
        return False


def resolve_image_source(value: str | None) -> str | BinaryIO | None:
    """
    Resolve a Field.value to something reportlab ImageReader can load.

    Accepts:
    - storage-relative names (e.g. signatures/2026/07/abc.png)
    - /media/... or MEDIA_URL-prefixed paths
    - absolute local filesystem paths (legacy field values)
    """
    if not value:
        return None
    if value.startswith("data:image"):
        return None

    media_url = settings.MEDIA_URL or "/media/"
    candidate = value
    if candidate.startswith(media_url):
        candidate = candidate[len(media_url) :].lstrip("/")
    elif candidate.startswith("/media/"):
        candidate = candidate[len("/media/") :]

    # Prefer Django storage (local or Spaces)
    if ".." not in candidate.split("/") and storage_exists(candidate):
        return storage_open(candidate)

    # Legacy: absolute or relative filesystem path stored in Field.value
    if os.path.exists(value):
        return value
    if os.path.exists(candidate):
        return candidate
    return None
