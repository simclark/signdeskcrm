from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail

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

    subject = f"You're invited to join {tenant.name} on SignDesk"
    if user_exists:
        action = f"Open this link to join the workspace:\n{invite_url}"
    else:
        action = (
            f"Open this link to create your password and activate your account:\n"
            f"{invite_url}"
        )

    body = (
        f"Hello,\n\n"
        f"{inviter_name} has invited you to join {tenant.name} on SignDesk "
        f"as a {role_label}.\n\n"
        f"{action}\n\n"
        f"This invitation expires in 7 days.\n\n"
        f"— SignDesk\n"
    )
    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [invitation.email], fail_silently=False)
