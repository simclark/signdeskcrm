# Generated manually for platform ops control plane

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def set_staff_admin_role(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(is_staff=True).exclude(platform_role__in=["viewer", "support", "operator", "admin"]).update(
        platform_role="admin"
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_passwordresettoken_tenant_nullable"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="platform_role",
            field=models.CharField(
                blank=True,
                default="",
                help_text="viewer | support | operator | admin (staff only)",
                max_length=20,
            ),
        ),
        migrations.RunPython(set_staff_admin_role, migrations.RunPython.noop),
    ]
