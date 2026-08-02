from django.db import migrations, models


def populate_active_email(apps, schema_editor):
    Contact = apps.get_model("contacts", "Contact")
    for contact in Contact.objects.all().iterator():
        if contact.is_archived:
            contact.active_email = None
        else:
            contact.active_email = (contact.email or "").strip().lower() or None
        contact.save(update_fields=["active_email"])


def clear_active_email(apps, schema_editor):
    Contact = apps.get_model("contacts", "Contact")
    Contact.objects.update(active_email=None)


class Migration(migrations.Migration):

    dependencies = [
        ("contacts", "0006_company_website_charfield"),
    ]

    operations = [
        migrations.AddField(
            model_name="contact",
            name="active_email",
            field=models.EmailField(blank=True, max_length=254, null=True),
        ),
        migrations.RunPython(populate_active_email, clear_active_email),
        migrations.RemoveConstraint(
            model_name="contact",
            name="uniq_contact_email_per_tenant",
        ),
        migrations.AddConstraint(
            model_name="contact",
            constraint=models.UniqueConstraint(
                fields=("tenant", "active_email"),
                name="uniq_contact_active_email_per_tenant",
            ),
        ),
    ]
