# Generated manually for free-trial entitlement fields

from django.db import migrations, models


def grandfather_existing_tenants(apps, schema_editor):
    Tenant = apps.get_model("tenants", "Tenant")
    Tenant.objects.all().update(
        subscription_status="active",
        trial_ends_at=None,
        trial_warning_sent_at=None,
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0013_tenant_prefixed_media_paths"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenant",
            name="subscription_status",
            field=models.CharField(
                choices=[
                    ("trialing", "Trialing"),
                    ("active", "Active"),
                    ("expired", "Expired"),
                ],
                db_index=True,
                default="trialing",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="tenant",
            name="trial_ends_at",
            field=models.DateTimeField(
                blank=True,
                help_text="When the free trial ends. Null for grandfathered/active subscriptions.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="tenant",
            name="trial_warning_sent_at",
            field=models.DateTimeField(
                blank=True,
                help_text="When the 24h trial-ending warning email was sent.",
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="platformopsevent",
            name="action",
            field=models.CharField(
                choices=[
                    ("provision", "Provision tenant"),
                    ("suspend", "Suspend tenant"),
                    ("reactivate", "Reactivate tenant"),
                    ("update", "Update tenant"),
                    ("invite", "Invite admin"),
                    ("invite_resend", "Resend invite"),
                    ("invite_revoke", "Revoke invite"),
                    ("demo_reset", "Reset demo workspace"),
                    ("media_audit", "Media orphan audit"),
                    ("media_delete", "Delete media orphans"),
                    ("form_seed", "Seed form library"),
                    ("support_snapshot", "View support snapshot"),
                    ("trial_extended", "Extend free trial"),
                    ("subscription_activated", "Mark subscription active"),
                ],
                db_index=True,
                max_length=64,
            ),
        ),
        migrations.RunPython(grandfather_existing_tenants, noop_reverse),
    ]
