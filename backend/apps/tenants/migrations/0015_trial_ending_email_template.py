# Generated manually for trial_ending email template key

from django.db import migrations, models

from apps.tenants.email_templates import DEFAULT_TEMPLATES, EmailTemplateKey


NEW_KEYS = (EmailTemplateKey.TRIAL_ENDING,)


def seed_trial_ending_template(apps, schema_editor):
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


def unseed_trial_ending_template(apps, schema_editor):
    EmailTemplate = apps.get_model("tenants", "EmailTemplate")
    EmailTemplate.objects.filter(key__in=NEW_KEYS).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0014_tenant_trial_entitlement"),
    ]

    operations = [
        migrations.AlterField(
            model_name="emailtemplate",
            name="key",
            field=models.CharField(
                choices=[
                    ("workspace_invite", "Workspace invitation"),
                    ("password_reset", "Password reset"),
                    ("signing_invite", "Signing invitation"),
                    ("signing_reminder", "Signing reminder"),
                    ("cc_notice", "CC copy notice"),
                    ("completion", "Document completed"),
                    ("envelope_voided", "Envelope voided"),
                    ("envelope_declined", "Envelope declined"),
                    ("trial_ending", "Free trial ending"),
                ],
                max_length=64,
            ),
        ),
        migrations.RunPython(seed_trial_ending_template, unseed_trial_ending_template),
    ]
