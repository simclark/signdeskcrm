"""Default transactional email templates and placeholder catalogs."""

from __future__ import annotations

from typing import TypedDict


class TemplateDefault(TypedDict):
    label: str
    description: str
    subject: str
    body: str
    placeholders: tuple[str, ...]
    cta_label: str


class EmailTemplateKey:
    WORKSPACE_INVITE = "workspace_invite"
    PASSWORD_RESET = "password_reset"
    SIGNUP_CONFIRM = "signup_confirm"
    SIGNING_INVITE = "signing_invite"
    SIGNING_REMINDER = "signing_reminder"
    CC_NOTICE = "cc_notice"
    COMPLETION = "completion"
    ENVELOPE_VOIDED = "envelope_voided"
    ENVELOPE_DECLINED = "envelope_declined"
    TRIAL_ENDING = "trial_ending"

    CHOICES = (
        (WORKSPACE_INVITE, "Workspace invitation"),
        (PASSWORD_RESET, "Password reset"),
        (SIGNUP_CONFIRM, "Signup confirmation"),
        (SIGNING_INVITE, "Signing invitation"),
        (SIGNING_REMINDER, "Signing reminder"),
        (CC_NOTICE, "CC copy notice"),
        (COMPLETION, "Document completed"),
        (ENVELOPE_VOIDED, "Envelope voided"),
        (ENVELOPE_DECLINED, "Envelope declined"),
        (TRIAL_ENDING, "Free trial ending"),
    )

    ALL = (
        WORKSPACE_INVITE,
        PASSWORD_RESET,
        SIGNUP_CONFIRM,
        SIGNING_INVITE,
        SIGNING_REMINDER,
        CC_NOTICE,
        COMPLETION,
        ENVELOPE_VOIDED,
        ENVELOPE_DECLINED,
        TRIAL_ENDING,
    )


DEFAULT_TEMPLATES: dict[str, TemplateDefault] = {
    EmailTemplateKey.WORKSPACE_INVITE: {
        "label": "Workspace invitation",
        "description": "Sent when someone is invited to join your workspace.",
        "subject": "You're invited to join {{tenant_name}} on SignDesk",
        "body": (
            "Hello,\n\n"
            "{{inviter_name}} has invited you to join {{tenant_name}} on SignDesk "
            "as a {{role_label}}.\n\n"
            "{{action_instruction}}\n\n"
            "{{action_url}}\n\n"
            "This invitation expires in 7 days."
        ),
        "placeholders": (
            "tenant_name",
            "inviter_name",
            "role_label",
            "action_instruction",
            "action_url",
        ),
        "cta_label": "Accept invitation",
    },
    EmailTemplateKey.PASSWORD_RESET: {
        "label": "Password reset",
        "description": "Sent when a workspace member requests or is sent a password reset.",
        "subject": "Reset your {{tenant_name}} password",
        "body": (
            "Hello {{user_name}},\n\n"
            "We received a request to reset your password for {{tenant_name}} on SignDesk.\n\n"
            "Open the link below to choose a new password. This link expires in 24 hours.\n\n"
            "{{action_url}}\n\n"
            "If you did not request this, you can ignore this email."
        ),
        "placeholders": (
            "tenant_name",
            "user_name",
            "action_url",
        ),
        "cta_label": "Reset password",
    },
    EmailTemplateKey.SIGNUP_CONFIRM: {
        "label": "Signup confirmation",
        "description": "Sent after public signup to confirm email and set the owner password.",
        "subject": "Confirm your email and set up {{tenant_name}}",
        "body": (
            "Hello {{user_name}},\n\n"
            "Thanks for creating {{tenant_name}} on SignDesk.\n\n"
            "Confirm your email and choose a password using the link below. "
            "This link expires in 24 hours.\n\n"
            "{{action_url}}\n\n"
            "If you did not create this workspace, you can ignore this email."
        ),
        "placeholders": (
            "tenant_name",
            "user_name",
            "action_url",
        ),
        "cta_label": "Set password",
    },
    EmailTemplateKey.SIGNING_INVITE: {
        "label": "Signing invitation",
        "description": "Sent when a document is ready for someone to sign.",
        "subject": "Please sign: {{envelope_title}}",
        "body": (
            "Hello {{recipient_name}},\n\n"
            "{{tenant_name}} has sent you a document to sign: {{envelope_title}}.\n\n"
            "{{envelope_message}}\n\n"
            "Open the link below to review and sign."
        ),
        "placeholders": (
            "recipient_name",
            "tenant_name",
            "envelope_title",
            "envelope_message",
            "action_url",
        ),
        "cta_label": "Review and sign",
    },
    EmailTemplateKey.SIGNING_REMINDER: {
        "label": "Signing reminder",
        "description": "Sent when a signer has not yet completed their signature.",
        "subject": "Reminder: please sign {{envelope_title}}",
        "body": (
            "Hello {{recipient_name}},\n\n"
            "This is a friendly reminder that {{tenant_name}} is waiting for your "
            "signature on: {{envelope_title}}.\n\n"
            "{{envelope_message}}\n\n"
            "Open the link below to review and sign."
        ),
        "placeholders": (
            "recipient_name",
            "tenant_name",
            "envelope_title",
            "envelope_message",
            "action_url",
        ),
        "cta_label": "Review and sign",
    },
    EmailTemplateKey.CC_NOTICE: {
        "label": "CC copy notice",
        "description": "Sent to CC recipients when an envelope is sent (view-only).",
        "subject": "Copy: {{envelope_title}}",
        "body": (
            "Hello {{recipient_name}},\n\n"
            "{{tenant_name}} has sent '{{envelope_title}}' for signature. You were "
            "added as a copy recipient (CC) and are not required to sign.\n\n"
            "{{envelope_message}}\n\n"
            "Open the link below to review the document. You will receive another "
            "email when signing is complete."
        ),
        "placeholders": (
            "recipient_name",
            "tenant_name",
            "envelope_title",
            "envelope_message",
            "action_url",
        ),
        "cta_label": "View document",
    },
    EmailTemplateKey.COMPLETION: {
        "label": "Document completed",
        "description": "Sent to all parties when every signature is complete.",
        "subject": "Completed: {{envelope_title}}",
        "body": (
            "Hello {{recipient_name}},\n\n"
            "The document '{{envelope_title}}' has been completed by all parties.\n\n"
            "Download your signed PDF and Certificate of Completion using the link "
            "below (no sign-in required while this link remains valid).\n\n"
            "You may also request copies from the sender. Keep your own copies for "
            "your records."
        ),
        "placeholders": (
            "recipient_name",
            "tenant_name",
            "envelope_title",
            "action_url",
        ),
        "cta_label": "Download documents",
    },
    EmailTemplateKey.ENVELOPE_VOIDED: {
        "label": "Envelope voided",
        "description": "Sent to all recipients when the sender voids an envelope.",
        "subject": "Voided: {{envelope_title}}",
        "body": (
            "Hello {{recipient_name}},\n\n"
            "{{tenant_name}} has voided the envelope '{{envelope_title}}'. "
            "Signing links for this document no longer work.\n\n"
            "{{void_reason}}\n\n"
            "Contact the sender if you have questions."
        ),
        "placeholders": (
            "recipient_name",
            "tenant_name",
            "envelope_title",
            "void_reason",
        ),
        "cta_label": "",
    },
    EmailTemplateKey.ENVELOPE_DECLINED: {
        "label": "Envelope declined",
        "description": "Sent to the sender when a signer declines to sign.",
        "subject": "Declined: {{envelope_title}}",
        "body": (
            "Hello {{recipient_name}},\n\n"
            "{{decliner_name}} ({{decliner_email}}) declined to sign "
            "'{{envelope_title}}'.\n\n"
            "{{decline_reason}}\n\n"
            "Open the envelope in SignDesk to review status or send a new packet."
        ),
        "placeholders": (
            "recipient_name",
            "tenant_name",
            "envelope_title",
            "decliner_name",
            "decliner_email",
            "decline_reason",
            "action_url",
        ),
        "cta_label": "Open envelope",
    },
    EmailTemplateKey.TRIAL_ENDING: {
        "label": "Free trial ending",
        "description": "Sent about 24 hours before the free trial ends.",
        "subject": "Your {{tenant_name}} free trial ends tomorrow",
        "body": (
            "Hello {{recipient_name}},\n\n"
            "Your free trial of SignDesk for {{tenant_name}} ends on {{trial_ends_at}}.\n\n"
            "After that, the workspace will become read-only until you subscribe.\n\n"
            "Open your workspace to continue working while the trial is still active:\n\n"
            "{{action_url}}"
        ),
        "placeholders": (
            "recipient_name",
            "tenant_name",
            "trial_ends_at",
            "action_url",
        ),
        "cta_label": "Open workspace",
    },
}


def get_default(key: str) -> TemplateDefault:
    try:
        return DEFAULT_TEMPLATES[key]
    except KeyError as exc:
        raise KeyError(f"Unknown email template key: {key}") from exc


def get_cta_label(key: str) -> str:
    return get_default(key).get("cta_label") or ""
