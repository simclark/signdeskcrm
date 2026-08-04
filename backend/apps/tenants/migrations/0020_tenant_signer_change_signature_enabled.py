from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0019_tenant_signer_decline_enabled"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenant",
            name="signer_change_signature_enabled",
            field=models.BooleanField(
                default=False,
                help_text="When on, signers can reopen Adopt signature to change their signature.",
            ),
        ),
    ]
