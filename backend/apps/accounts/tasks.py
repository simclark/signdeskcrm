import html

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives

from apps.accounts.services import platform_frontend_url
from apps.tenants.email_templates import EmailTemplateKey, get_cta_label, get_default
from apps.tenants.mail import apply_placeholders, send_templated_email


@shared_task
def send_password_reset(reset_id: int):
    from apps.accounts.models import PasswordResetToken

    reset = PasswordResetToken.objects.select_related("user", "tenant").get(pk=reset_id)
    if reset.is_platform:
        _send_platform_password_reset(reset)
        return

    tenant = reset.tenant
    reset_url = tenant.frontend_url(f"/reset-password/{reset.token}")
    # First-time owners (signup) have an unusable password until they confirm.
    key = (
        EmailTemplateKey.SIGNUP_CONFIRM
        if not reset.user.has_usable_password()
        else EmailTemplateKey.PASSWORD_RESET
    )
    send_templated_email(
        tenant=tenant,
        key=key,
        to_email=reset.user.email,
        context={
            "tenant_name": tenant.name,
            "user_name": reset.user.full_name,
            "action_url": reset_url,
        },
        action_url=reset_url,
    )


def _send_platform_password_reset(reset) -> None:
    """Send a SignDesk-branded reset email for platform staff (no tenant template)."""
    reset_url = platform_frontend_url(f"/reset-password/{reset.token}")
    default = get_default(EmailTemplateKey.PASSWORD_RESET)
    context = {
        "tenant_name": "SignDesk Platform",
        "user_name": reset.user.full_name,
        "action_url": reset_url,
    }
    subject = apply_placeholders(default["subject"], context)
    text_body = apply_placeholders(default["body"], context)
    if reset_url not in text_body:
        text_body = f"{text_body}\n\n{reset_url}"

    cta = html.escape(get_cta_label(EmailTemplateKey.PASSWORD_RESET))
    safe_url = html.escape(reset_url, quote=True)
    safe_body = html.escape(text_body).replace("\n", "<br>\n")
    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:system-ui,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;
                border:1px solid #e5e7eb;">
    <tr>
      <td style="padding:24px 28px 16px;border-bottom:3px solid #0B6E4F;">
        <div style="font-size:20px;font-weight:700;color:#0B6E4F;">SignDesk</div>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;font-size:15px;line-height:1.55;color:#1f2937;">
        <p style="margin:0 0 16px;">{safe_body}</p>
        <p style="margin:24px 0 0;">
          <a href="{safe_url}"
             style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;
                    color:#ffffff;text-decoration:none;border-radius:6px;background:#0B6E4F;">
            {cta}
          </a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>"""

    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[reset.user.email],
    )
    message.attach_alternative(html_body, "text/html")
    message.send(fail_silently=False)
