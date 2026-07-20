# Generated manually for new transactional email template keys

from django.db import migrations, models

from apps.tenants.email_templates import DEFAULT_TEMPLATES, EmailTemplateKey


NEW_KEYS = (
    EmailTemplateKey.CC_NOTICE,
    EmailTemplateKey.ENVELOPE_VOIDED,
    EmailTemplateKey.ENVELOPE_DECLINED,
)


def seed_new_email_templates(apps, schema_editor):
    Tenant = apps.get_model("tenants", "Tenant")
    EmailTemplate = apps.get_model("tenants", "EmailTemplate")
    for tenant in Tenant.objects.all():
        for key in NEW_KEYS:
            default = DEFAULT_TEMPLATES[key]
            EmailTemplate.objects.get_or_create(
                tenant=tenant,
                key=key,
                defaults={
                    "subject": default["subject"],
                    "body": default["body"],
                },
            )


def unseed_new_email_templates(apps, schema_editor):
    EmailTemplate = apps.get_model("tenants", "EmailTemplate")
    EmailTemplate.objects.filter(key__in=NEW_KEYS).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0009_listings_enabled"),
    ]

    operations = [
        migrations.AlterField(
            model_name="emailtemplate",
            name="key",
            field=models.CharField(
                choices=[
                    ("workspace_invite", "Workspace invitation"),
                    ("signing_invite", "Signing invitation"),
                    ("signing_reminder", "Signing reminder"),
                    ("cc_notice", "CC copy notice"),
                    ("completion", "Document completed"),
                    ("envelope_voided", "Envelope voided"),
                    ("envelope_declined", "Envelope declined"),
                ],
                max_length=64,
            ),
        ),
        migrations.RunPython(seed_new_email_templates, unseed_new_email_templates),
    ]
