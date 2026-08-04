# Rename subscription_status value trialing → trial

from django.db import migrations, models


def rename_trialing_to_trial(apps, schema_editor):
    Tenant = apps.get_model("tenants", "Tenant")
    Tenant.objects.filter(subscription_status="trialing").update(subscription_status="trial")


def rename_trial_to_trialing(apps, schema_editor):
    Tenant = apps.get_model("tenants", "Tenant")
    Tenant.objects.filter(subscription_status="trial").update(subscription_status="trialing")


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0015_trial_ending_email_template"),
    ]

    operations = [
        migrations.RunPython(rename_trialing_to_trial, rename_trial_to_trialing),
        migrations.AlterField(
            model_name="tenant",
            name="subscription_status",
            field=models.CharField(
                choices=[
                    ("trial", "Trial"),
                    ("active", "Active"),
                    ("expired", "Expired"),
                ],
                db_index=True,
                default="trial",
                max_length=20,
            ),
        ),
    ]
