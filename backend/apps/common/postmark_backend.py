"""Django email backend that delivers via Postmark HTTP API (HTTPS :443).

Prefer this over smtp.postmarkapp.com:587 on DigitalOcean droplets, where
outbound SMTP is often blocked.
"""

from __future__ import annotations

import base64
import json
import logging
import urllib.error
import urllib.request
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)

POSTMARK_EMAIL_URL = "https://api.postmarkapp.com/email"


class PostmarkAPIEmailBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        if not email_messages:
            return 0
        token = (getattr(settings, "POSTMARK_SERVER_TOKEN", None) or "").strip()
        if not token:
            if not self.fail_silently:
                raise RuntimeError("POSTMARK_SERVER_TOKEN is not configured")
            return 0

        sent = 0
        for message in email_messages:
            try:
                self._send_one(message, token)
                sent += 1
            except Exception:
                logger.exception("Postmark send failed")
                if not self.fail_silently:
                    raise
        return sent

    def _send_one(self, message, token: str) -> None:
        payload = _django_message_to_postmark(message)
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            POSTMARK_EMAIL_URL,
            data=data,
            method="POST",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Postmark-Server-Token": token,
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Postmark API error ({exc.code}): {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Postmark API request failed: {exc.reason}") from exc

        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Postmark API returned invalid JSON: {raw[:200]}") from exc

        if parsed.get("ErrorCode", 0) != 0:
            raise RuntimeError(
                f"Postmark error {parsed.get('ErrorCode')}: {parsed.get('Message')}"
            )


def _django_message_to_postmark(message) -> dict:
    from_email = message.from_email or settings.DEFAULT_FROM_EMAIL
    to = ", ".join(message.to or [])
    if not from_email or not to:
        raise RuntimeError("Email message is missing From or To")

    text_body = message.body or ""
    html_body = None
    for content, mimetype in getattr(message, "alternatives", []) or []:
        if mimetype == "text/html":
            html_body = content
            break

    if not text_body and not html_body:
        raise RuntimeError("Email message has no text or HTML body")

    payload: dict = {
        "From": from_email,
        "To": to,
        "Subject": message.subject or "",
    }
    if text_body:
        payload["TextBody"] = text_body
    if html_body:
        payload["HtmlBody"] = html_body
    if message.cc:
        payload["Cc"] = ", ".join(message.cc)
    if message.bcc:
        payload["Bcc"] = ", ".join(message.bcc)
    if message.reply_to:
        payload["ReplyTo"] = ", ".join(message.reply_to)

    attachments = _postmark_attachments(message)
    if attachments:
        payload["Attachments"] = attachments

    return payload


def _postmark_attachments(message) -> list[dict]:
    """Map Django MIME attachments (including inline CID images) to Postmark."""
    out: list[dict] = []
    for attachment in message.attachments:
        # Django may pass (filename, content, mimetype) or MIMEBase
        if isinstance(attachment, tuple) and len(attachment) == 3:
            filename, content, mimetype = attachment
            if isinstance(content, str):
                content = content.encode("utf-8")
            out.append(
                {
                    "Name": filename or "attachment",
                    "Content": base64.b64encode(content).decode("ascii"),
                    "ContentType": mimetype or "application/octet-stream",
                }
            )
            continue

        # MIMEBase / MIMEImage (inline brand logo)
        try:
            payload = attachment.get_payload(decode=True)
            if payload is None:
                continue
            filename = attachment.get_filename() or "attachment"
            content_type = attachment.get_content_type() or "application/octet-stream"
            item = {
                "Name": filename,
                "Content": base64.b64encode(payload).decode("ascii"),
                "ContentType": content_type,
            }
            content_id = attachment.get("Content-ID")
            if content_id:
                # Postmark wants ContentID without angle brackets for cid: refs
                item["ContentID"] = content_id.strip("<>")
            out.append(item)
        except Exception:
            logger.exception("Skipping unreadable email attachment")
    return out
