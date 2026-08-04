"""Ensure platform form-library catalog entries for a tenant.

The curated SignDesk catalog is empty (Shared library is workspace-published
only). This function remains as a no-op for CLI/platform call sites that still
invoke it.
"""

from __future__ import annotations

from apps.tenants.models import Tenant


def ensure_form_library(tenant: Tenant, *, replace: bool = False) -> dict[str, int]:
    """No-op: SignDesk curated starters are no longer seeded.

    Returns zero counts for API/CLI compatibility.
    """
    del tenant, replace
    return {"created": 0, "updated": 0, "skipped": 0}
