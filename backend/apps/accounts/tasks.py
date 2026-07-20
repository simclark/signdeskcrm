from celery import shared_task

from apps.tenants.email_templates import EmailTemplateKey
from apps.tenants.mail import send_templated_email


@shared_task
def send_password_reset(reset_id: int):
    from apps.accounts.models import PasswordResetToken

    reset = PasswordResetToken.objects.select_related("user", "tenant").get(pk=reset_id)
    tenant = reset.tenant
    reset_url = tenant.frontend_url(f"/reset-password/{reset.token}")
    send_templated_email(
        tenant=tenant,
        key=EmailTemplateKey.PASSWORD_RESET,
        to_email=reset.user.email,
        context={
            "tenant_name": tenant.name,
            "user_name": reset.user.full_name,
            "action_url": reset_url,
        },
        action_url=reset_url,
    )
