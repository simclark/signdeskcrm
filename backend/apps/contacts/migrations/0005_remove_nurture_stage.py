from django.db import migrations, models


def migrate_nurture_to_lead(apps, schema_editor):
    Contact = apps.get_model("contacts", "Contact")
    Contact.objects.filter(stage="nurture").update(stage="lead")


class Migration(migrations.Migration):

    dependencies = [
        ("contacts", "0004_follow_up_plans"),
    ]

    operations = [
        migrations.RunPython(migrate_nurture_to_lead, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="contact",
            name="stage",
            field=models.CharField(
                blank=True,
                choices=[
                    ("lead", "Lead"),
                    ("active", "Active"),
                    ("under_contract", "Under contract"),
                    ("closed", "Closed"),
                    ("inactive", "Inactive"),
                ],
                default="lead",
                max_length=32,
            ),
        ),
    ]
