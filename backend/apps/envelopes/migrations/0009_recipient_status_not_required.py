from django.db import migrations, models


def forwards_auto_signed_to_not_required(apps, schema_editor):
    """Recipients previously auto-marked signed with no signing tasks."""
    Recipient = apps.get_model("envelopes", "Recipient")
    Field = apps.get_model("envelopes", "Field")
    AuditEvent = apps.get_model("audit", "AuditEvent")

    candidates = Recipient.objects.filter(role="signer", status="signed")
    for recipient in candidates.iterator():
        has_signer_tasks = Field.objects.filter(
            recipient_id=recipient.id, fill_mode="signer"
        ).exists()
        if has_signer_tasks:
            continue
        has_signed_audit = AuditEvent.objects.filter(
            recipient_id=recipient.id, event_type="signed"
        ).exists()
        if has_signed_audit:
            continue
        recipient.status = "not_required"
        recipient.signed_at = None
        recipient.save(update_fields=["status", "signed_at", "updated_at"])


def backwards_not_required_to_signed(apps, schema_editor):
    Recipient = apps.get_model("envelopes", "Recipient")
    Recipient.objects.filter(status="not_required").update(status="signed")


class Migration(migrations.Migration):

    dependencies = [
        ("envelopes", "0008_tenant_prefixed_media_paths"),
        ("audit", "0003_alter_auditevent_event_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="recipient",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("sent", "Sent"),
                    ("viewed", "Viewed"),
                    ("signed", "Signed"),
                    ("not_required", "Not required"),
                    ("declined", "Declined"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.RunPython(
            forwards_auto_signed_to_not_required,
            backwards_not_required_to_signed,
        ),
    ]
