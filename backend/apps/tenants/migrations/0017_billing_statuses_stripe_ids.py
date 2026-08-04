# Generated manually for billing readiness statuses + Stripe id fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0016_rename_trialing_to_trial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="tenant",
            name="subscription_status",
            field=models.CharField(
                choices=[
                    ("trial", "Trial"),
                    ("active", "Active"),
                    ("past_due", "Past due"),
                    ("canceled", "Canceled"),
                    ("expired", "Expired"),
                ],
                db_index=True,
                default="trial",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="tenant",
            name="stripe_customer_id",
            field=models.CharField(blank=True, db_index=True, max_length=255),
        ),
        migrations.AddField(
            model_name="tenant",
            name="stripe_subscription_id",
            field=models.CharField(blank=True, db_index=True, max_length=255),
        ),
    ]
