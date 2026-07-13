from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("documents", "0002_require_template_document"),
    ]

    operations = [
        migrations.AddField(
            model_name="template",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
    ]
