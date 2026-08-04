from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0018_signup_confirm_email_template"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenant",
            name="signer_decline_enabled",
            field=models.BooleanField(
                default=False,
                help_text="When on, signers see a Decline button in the signing experience.",
            ),
        ),
    ]
