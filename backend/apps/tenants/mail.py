"""Render and send branded transactional emails."""

from __future__ import annotations

import html
import mimetypes
import os
import re
from email.mime.image import MIMEImage

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

from apps.tenants.email_templates import get_cta_label, get_default
from apps.tenants.models import EmailTemplate, Tenant, ensure_email_templates

PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")
URL_RE = re.compile(r"(https?://[^\s<>\"']+)")


def apply_placeholders(text: str, context: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in context:
            return ""
        return str(context[key] or "")

    # Collapse leftover blank lines from empty optional fields (e.g. envelope_message)
    rendered = PLACEHOLDER_RE.sub(replace, text or "")
    rendered = re.sub(r"\n{3,}", "\n\n", rendered)
    return rendered.strip()


def resolve_template(tenant: Tenant, key: str) -> EmailTemplate:
    ensure_email_templates(tenant)
    try:
        return EmailTemplate.objects.get(tenant=tenant, key=key)
    except EmailTemplate.DoesNotExist:
        default = get_default(key)
        return EmailTemplate(
            tenant=tenant,
            key=key,
            subject=default["subject"],
            body=default["body"],
        )


def _plain_body_to_html(body: str) -> str:
    escaped = html.escape(body)
    parts = [p.strip() for p in escaped.split("\n\n")]
    blocks: list[str] = []
    for part in parts:
        if not part:
            continue
        with_breaks = part.replace("\n", "<br>\n")
        with_links = URL_RE.sub(
            r'<a href="\1" style="color:#0B6E4F;text-decoration:underline;">\1</a>',
            with_breaks,
        )
        blocks.append(
            f'<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#1f2937;">'
            f"{with_links}</p>"
        )
    return "\n".join(blocks)


def _read_image_attachment(field_file) -> tuple[bytes, str, str] | None:
    if not field_file:
        return None
    try:
        field_file.open("rb")
        data = field_file.read()
        field_file.close()
    except (FileNotFoundError, OSError, ValueError):
        return None
    if not data:
        return None
    name = os.path.basename(getattr(field_file, "name", "") or "brand.png")
    content_type, _ = mimetypes.guess_type(name)
    if not content_type or not content_type.startswith("image/"):
        content_type = "image/png"
    subtype = content_type.split("/", 1)[1]
    return data, subtype, name


def build_branded_html(
    *,
    tenant: Tenant,
    body_html: str,
    action_url: str | None = None,
    cta_label: str | None = None,
    brand_cid: str | None = None,
) -> str:
    accent = tenant.accent_color or "#0B6E4F"
    tenant_name = html.escape(tenant.name)

    if brand_cid:
        brand_block = (
            f'<img src="cid:{brand_cid}" alt="{tenant_name}" '
            f'style="max-height:48px;max-width:200px;display:block;border:0;" />'
        )
    else:
        brand_block = (
            f'<div style="font-size:20px;font-weight:700;color:{html.escape(accent)};">'
            f"{tenant_name}</div>"
        )

    cta_block = ""
    if action_url and cta_label:
        safe_url = html.escape(action_url, quote=True)
        safe_label = html.escape(cta_label)
        cta_block = f"""
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
          <tr>
            <td style="border-radius:6px;background:{html.escape(accent)};">
              <a href="{safe_url}"
                 style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;
                        color:#ffffff;text-decoration:none;border-radius:6px;">
                {safe_label}
              </a>
            </td>
          </tr>
        </table>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;
                      border:1px solid #e5e7eb;">
          <tr>
            <td style="padding:24px 28px 16px;border-bottom:3px solid {html.escape(accent)};">
              {brand_block}
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              {body_html}
              {cta_block}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;">
                Sent by {tenant_name} via SignDesk
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def send_templated_email(
    *,
    tenant: Tenant,
    key: str,
    to_email: str,
    context: dict[str, str],
    action_url: str | None = None,
    cta_label: str | None = None,
) -> None:
    template = resolve_template(tenant, key)
    subject = apply_placeholders(template.subject, context)
    text_body = apply_placeholders(template.body, context)

    # Append action URL to plain text if not already present
    if action_url and action_url not in text_body:
        text_body = f"{text_body}\n\n{action_url}"

    body_html = _plain_body_to_html(text_body)
    brand_cid: str | None = None
    brand_attachment: tuple[bytes, str, str] | None = None

    for field in (tenant.logo, tenant.icon):
        attachment = _read_image_attachment(field)
        if attachment:
            brand_attachment = attachment
            brand_cid = "brand_logo"
            break

    html_body = build_branded_html(
        tenant=tenant,
        body_html=body_html,
        action_url=action_url,
        cta_label=cta_label or get_cta_label(key),
        brand_cid=brand_cid,
    )

    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to_email],
    )
    message.attach_alternative(html_body, "text/html")

    if brand_attachment and brand_cid:
        data, subtype, filename = brand_attachment
        image = MIMEImage(data, _subtype=subtype)
        image.add_header("Content-ID", f"<{brand_cid}>")
        image.add_header("Content-Disposition", "inline", filename=filename)
        message.attach(image)
        message.mixed_subtype = "related"

    message.send(fail_silently=False)
