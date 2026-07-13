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
    SIGNING_INVITE = "signing_invite"
    SIGNING_REMINDER = "signing_reminder"
    COMPLETION = "completion"

    CHOICES = (
        (WORKSPACE_INVITE, "Workspace invitation"),
        (SIGNING_INVITE, "Signing invitation"),
        (SIGNING_REMINDER, "Signing reminder"),
        (COMPLETION, "Document completed"),
    )

    ALL = (
        WORKSPACE_INVITE,
        SIGNING_INVITE,
        SIGNING_REMINDER,
        COMPLETION,
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
}


def get_default(key: str) -> TemplateDefault:
    try:
        return DEFAULT_TEMPLATES[key]
    except KeyError as exc:
        raise KeyError(f"Unknown email template key: {key}") from exc


def get_cta_label(key: str) -> str:
    return get_default(key)["cta_label"]
