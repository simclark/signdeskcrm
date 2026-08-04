# Generated manually for Shared library simplification

from django.db import migrations, models


def archive_platform_starters(apps, schema_editor):
    Template = apps.get_model("documents", "Template")
    Template.objects.filter(library_key__isnull=False).exclude(library_key="").update(
        is_archived=True
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("documents", "0006_tenant_prefixed_media_paths"),
    ]

    operations = [
        migrations.RunPython(archive_platform_starters, noop_reverse),
        migrations.AlterField(
            model_name="template",
            name="is_library",
            field=models.BooleanField(
                default=False,
                help_text="Published to the workspace Shared library (cloneable starting point).",
            ),
        ),
        migrations.AlterField(
            model_name="template",
            name="library_key",
            field=models.CharField(
                blank=True,
                help_text="Legacy key for retired SignDesk starters (null for user templates).",
                max_length=128,
                null=True,
            ),
        ),
    ]
