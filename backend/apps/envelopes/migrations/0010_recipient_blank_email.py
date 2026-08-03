from django.db import migrations, models


def clear_placeholder_emails(apps, schema_editor):
    """Remove synthetic template placeholders; NULL lets MySQL unique allow multiples."""
    Recipient = apps.get_model("envelopes", "Recipient")
    Recipient.objects.filter(email__iendswith="@draft.local").update(email=None)
    Recipient.objects.filter(email="").update(email=None)


class Migration(migrations.Migration):
    dependencies = [
        ("envelopes", "0009_recipient_status_not_required"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="recipient",
            name="uniq_recipient_email_per_envelope",
        ),
        migrations.AlterField(
            model_name="recipient",
            name="email",
            field=models.EmailField(blank=True, max_length=254, null=True),
        ),
        migrations.RunPython(clear_placeholder_emails, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="recipient",
            constraint=models.UniqueConstraint(
                fields=("envelope", "email"),
                name="uniq_recipient_email_per_envelope",
            ),
        ),
    ]
