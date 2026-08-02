from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("contacts", "0005_remove_nurture_stage"),
    ]

    operations = [
        migrations.AlterField(
            model_name="company",
            name="website",
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
