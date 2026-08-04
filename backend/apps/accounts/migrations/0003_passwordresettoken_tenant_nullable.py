# Generated manually for platform staff password reset

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_passwordresettoken"),
    ]

    operations = [
        migrations.AlterField(
            model_name="passwordresettoken",
            name="tenant",
            field=models.ForeignKey(
                blank=True,
                help_text="Workspace for tenant resets; null for platform staff resets.",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="password_reset_tokens",
                to="tenants.tenant",
            ),
        ),
    ]
