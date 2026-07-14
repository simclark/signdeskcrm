from django.db import migrations, models
import django.db.models.deletion


def clear_document_field_recipients(apps, schema_editor):
    Field = apps.get_model("envelopes", "Field")
    Field.objects.filter(fill_mode="document").update(recipient_id=None)


class Migration(migrations.Migration):

    dependencies = [
        ("envelopes", "0005_field_fill_mode"),
    ]

    operations = [
        migrations.AlterField(
            model_name="field",
            name="recipient",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="fields",
                to="envelopes.recipient",
            ),
        ),
        migrations.RunPython(clear_document_field_recipients, migrations.RunPython.noop),
    ]

