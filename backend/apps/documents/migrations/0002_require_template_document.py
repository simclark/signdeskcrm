# Generated manually for PDF-backed templates

import django.db.models.deletion
from django.db import migrations, models


def delete_templates_without_document(apps, schema_editor):
    Template = apps.get_model("documents", "Template")
    Template.objects.filter(document__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("documents", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(delete_templates_without_document, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="template",
            name="document",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="templates",
                to="documents.document",
            ),
        ),
    ]
