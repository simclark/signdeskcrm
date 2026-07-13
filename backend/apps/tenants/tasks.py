from celery import shared_task
from django.contrib.auth import get_user_model

from apps.tenants.email_templates import EmailTemplateKey
from apps.tenants.mail import send_templated_email

User = get_user_model()


@shared_task
def send_member_invitation(invitation_id: int):
    from apps.tenants.models import Invitation

    invitation = Invitation.objects.select_related("tenant", "invited_by").get(pk=invitation_id)
    tenant = invitation.tenant
    invite_url = tenant.frontend_url(f"/invite/{invitation.token}")
    inviter = invitation.invited_by
    inviter_name = inviter.full_name if inviter else tenant.name
    role_label = invitation.get_role_display().lower()
    user_exists = User.objects.filter(email__iexact=invitation.email).exists()

    if user_exists:
        action_instruction = "Open this link to join the workspace:"
    else:
        action_instruction = (
            "Open this link to create your password and activate your account:"
        )

    send_templated_email(
        tenant=tenant,
        key=EmailTemplateKey.WORKSPACE_INVITE,
        to_email=invitation.email,
        context={
            "tenant_name": tenant.name,
            "inviter_name": inviter_name,
            "role_label": role_label,
            "action_instruction": action_instruction,
            "action_url": invite_url,
        },
        action_url=invite_url,
    )
