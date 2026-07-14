"""Merge token resolution for template/envelope field prefills.

Tokens use dotted keys (no braces), e.g. listing.address, contact.full_name, deal.price.
Values may be overridden via merge_data on the envelope or a resolve request body.
"""

from __future__ import annotations

from typing import Any


def _get_path(data: dict[str, Any], path: str) -> str:
    cur: Any = data
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return ""
        cur = cur[part]
    if cur is None:
        return ""
    return str(cur)


def _split_deal_and_custom(deal: dict | None) -> tuple[dict[str, Any], dict[str, Any]]:
    """Separate freeform merge_data into deal.* scalars and custom.* namespace."""
    raw = dict(deal or {})
    custom: dict[str, Any] = {}
    if isinstance(raw.get("custom"), dict):
        custom = {str(k): v for k, v in raw.pop("custom").items()}
    # Coerce nested non-scalars out of deal so resolve paths stay string-friendly
    deal_out: dict[str, Any] = {}
    for key, value in raw.items():
        if isinstance(value, dict):
            continue
        deal_out[str(key)] = value
    return deal_out, custom


def build_merge_context(
    *,
    contact=None,
    company=None,
    listing=None,
    deal: dict | None = None,
    recipients: list | None = None,
    extra: dict | None = None,
) -> dict[str, Any]:
    deal_data, custom_data = _split_deal_and_custom(deal)
    ctx: dict[str, Any] = {
        "contact": {},
        "company": {},
        "listing": {},
        "deal": deal_data,
        "custom": custom_data,
        "role": {},
    }

    if contact is not None:
        ctx["contact"] = {
            "first_name": contact.first_name or "",
            "last_name": contact.last_name or "",
            "full_name": contact.full_name,
            "email": contact.email or "",
            "phone": contact.phone or "",
            "title": contact.title or "",
        }
        if company is None and getattr(contact, "company", None) is not None:
            company = contact.company

    if company is not None:
        ctx["company"] = {
            "name": company.name or "",
            "website": company.website or "",
        }

    if listing is not None:
        ctx["listing"] = {
            "address": listing.address or "",
            "city": listing.city or "",
            "state": listing.state or "",
            "postal_code": listing.postal_code or "",
            "mls_number": listing.mls_number or "",
            "price": listing.price or "",
            "beds": listing.beds if listing.beds is not None else "",
            "baths": listing.baths if listing.baths is not None else "",
            "sqft": listing.sqft if listing.sqft is not None else "",
            "year_built": listing.year_built if listing.year_built is not None else "",
            "full_address": listing.full_address,
            "description": listing.description or "",
        }
        # Convenience: deal.price defaults from listing if not set
        if "price" not in ctx["deal"] and listing.price:
            ctx["deal"]["price"] = listing.price

    if recipients:
        for recipient in recipients:
            role_key = (getattr(recipient, "role_key", None) or "").strip()
            if not role_key:
                continue
            ctx["role"][role_key] = {
                "name": recipient.name or "",
                "email": recipient.email or "",
            }

    if extra:
        for key, value in extra.items():
            if isinstance(value, dict) and isinstance(ctx.get(key), dict):
                ctx[key] = {**ctx[key], **value}
            else:
                ctx[key] = value

    return ctx


def resolve_merge_token(token: str, context: dict[str, Any]) -> str:
    key = (token or "").strip().strip("{}").strip()
    if not key:
        return ""
    return _get_path(context, key)


def apply_merge_to_layout_items(
    layout: list[dict],
    context: dict[str, Any],
) -> list[dict]:
    """Return layout items with a resolved `value` when merge_token is set."""
    out = []
    for item in layout:
        copied = dict(item)
        token = (copied.get("merge_token") or "").strip()
        if token:
            copied["value"] = resolve_merge_token(token, context)
        out.append(copied)
    return out


KNOWN_MERGE_TOKENS = [
    "contact.first_name",
    "contact.last_name",
    "contact.full_name",
    "contact.email",
    "contact.phone",
    "contact.title",
    "company.name",
    "company.website",
    "listing.address",
    "listing.city",
    "listing.state",
    "listing.postal_code",
    "listing.full_address",
    "listing.mls_number",
    "listing.price",
    "listing.beds",
    "listing.baths",
    "listing.sqft",
    "listing.year_built",
    "listing.description",
    "deal.price",
    "deal.closing_date",
    "role.buyer.name",
    "role.buyer.email",
    "role.seller.name",
    "role.seller.email",
    "role.agent.name",
    "role.agent.email",
]
