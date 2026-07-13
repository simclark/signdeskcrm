# Generated manually for EmailTemplate model

from django.db import migrations, models
import django.db.models.deletion


def seed_email_templates(apps, schema_editor):
    Tenant = apps.get_model("tenants", "Tenant")
    EmailTemplate = apps.get_model("tenants", "EmailTemplate")
    defaults = {
        "workspace_invite": {
            "subject": "You're invited to join {{tenant_name}} on SignDesk",
            "body": (
                "Hello,\n\n"
                "{{inviter_name}} has invited you to join {{tenant_name}} on SignDesk "
                "as a {{role_label}}.\n\n"
                "{{action_instruction}}\n\n"
                "{{action_url}}\n\n"
                "This invitation expires in 7 days."
            ),
        },
        "signing_invite": {
            "subject": "Please sign: {{envelope_title}}",
            "body": (
                "Hello {{recipient_name}},\n\n"
                "{{tenant_name}} has sent you a document to sign: {{envelope_title}}.\n\n"
                "{{envelope_message}}\n\n"
                "Open the link below to review and sign."
            ),
        },
        "signing_reminder": {
            "subject": "Reminder: please sign {{envelope_title}}",
            "body": (
                "Hello {{recipient_name}},\n\n"
                "This is a friendly reminder that {{tenant_name}} is waiting for your "
                "signature on: {{envelope_title}}.\n\n"
                "{{envelope_message}}\n\n"
                "Open the link below to review and sign."
            ),
        },
        "completion": {
            "subject": "Completed: {{envelope_title}}",
            "body": (
                "Hello {{recipient_name}},\n\n"
                "The document '{{envelope_title}}' has been completed by all parties.\n\n"
                "Download your signed PDF and Certificate of Completion using the link "
                "below (no sign-in required while this link remains valid).\n\n"
                "You may also request copies from the sender. Keep your own copies for "
                "your records."
            ),
        },
    }
    for tenant in Tenant.objects.all():
        for key, values in defaults.items():
            EmailTemplate.objects.get_or_create(
                tenant=tenant,
                key=key,
                defaults={"subject": values["subject"], "body": values["body"]},
            )


def unseed_email_templates(apps, schema_editor):
    EmailTemplate = apps.get_model("tenants", "EmailTemplate")
    EmailTemplate.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0004_esign_ueta_consent"),
    ]

    operations = [
        migrations.CreateModel(
            name="EmailTemplate",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "key",
                    models.CharField(
                        choices=[
                            ("workspace_invite", "Workspace invitation"),
                            ("signing_invite", "Signing invitation"),
                            ("signing_reminder", "Signing reminder"),
                            ("completion", "Document completed"),
                        ],
                        max_length=64,
                    ),
                ),
                ("subject", models.CharField(max_length=255)),
                ("body", models.TextField()),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(class)ss",
                        to="tenants.tenant",
                    ),
                ),
            ],
            options={
                "ordering": ["tenant_id", "key"],
            },
        ),
        migrations.AddConstraint(
            model_name="emailtemplate",
            constraint=models.UniqueConstraint(
                fields=("tenant", "key"),
                name="uniq_email_template_tenant_key",
            ),
        ),
        migrations.RunPython(seed_email_templates, unseed_email_templates),
    ]
