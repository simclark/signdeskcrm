from celery import shared_task
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.tenants.email_templates import EmailTemplateKey
from apps.tenants.entitlements import trial_warning_hours
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


def _trial_warning_recipients(tenant) -> list[tuple[str, str]]:
    """Return unique (email, display_name) recipients for trial warnings."""
    from apps.tenants.models import Membership

    seen: set[str] = set()
    recipients: list[tuple[str, str]] = []

    def add(email: str, name: str = "") -> None:
        email = (email or "").lower().strip()
        if not email or email in seen:
            return
        seen.add(email)
        recipients.append((email, name or email))

    if tenant.primary_contact_email:
        add(tenant.primary_contact_email, tenant.primary_contact_name or "")

    owners = (
        Membership.objects.filter(
            tenant=tenant,
            is_active=True,
            role=Membership.Role.OWNER,
        )
        .select_related("user")
        .order_by("id")
    )
    for membership in owners:
        add(membership.user.email, membership.user.full_name)

    return recipients


@shared_task
def process_trial_lifecycle():
    """Send 24h trial warnings and flip past-due trials to expired."""
    from datetime import timedelta

    from apps.tenants.models import Tenant

    now = timezone.now()
    warning_horizon = now + timedelta(hours=trial_warning_hours())

    # Expire past trials
    expired_count = Tenant.objects.filter(
        subscription_status=Tenant.SubscriptionStatus.TRIAL,
        trial_ends_at__isnull=False,
        trial_ends_at__lte=now,
    ).update(subscription_status=Tenant.SubscriptionStatus.EXPIRED)

    # Warn tenants ending within the window (once)
    to_warn = Tenant.objects.filter(
        subscription_status=Tenant.SubscriptionStatus.TRIAL,
        trial_ends_at__isnull=False,
        trial_ends_at__gt=now,
        trial_ends_at__lte=warning_horizon,
        trial_warning_sent_at__isnull=True,
        status=Tenant.Status.ACTIVE,
    )
    warned = 0
    for tenant in to_warn:
        action_url = tenant.frontend_url("/app")
        trial_ends_display = timezone.localtime(tenant.trial_ends_at).strftime(
            "%b %d, %Y %I:%M %p %Z"
        )
        for email, name in _trial_warning_recipients(tenant):
            send_templated_email(
                tenant=tenant,
                key=EmailTemplateKey.TRIAL_ENDING,
                to_email=email,
                context={
                    "recipient_name": name or "there",
                    "tenant_name": tenant.name,
                    "trial_ends_at": trial_ends_display,
                    "action_url": action_url,
                },
                action_url=action_url,
            )
        tenant.trial_warning_sent_at = now
        tenant.save(update_fields=["trial_warning_sent_at", "updated_at"])
        warned += 1

    return {"expired": expired_count, "warned": warned}
