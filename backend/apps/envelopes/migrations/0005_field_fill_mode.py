from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("envelopes", "0004_envelope_listing_envelope_merge_data_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="field",
            name="fill_mode",
            field=models.CharField(
                choices=[("signer", "Signer completes"), ("document", "Document data (stamped on send)")],
                default="signer",
                max_length=20,
            ),
        ),
    ]
