# Generated manually for platform ops: plans, email events, impersonation

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("tenants", "0020_tenant_signer_change_signature_enabled"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenant",
            name="plan",
            field=models.CharField(
                db_index=True,
                default="starter",
                help_text="starter | professional | enterprise — drives seat/envelope quotas.",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="tenant",
            name="legal_hold",
            field=models.BooleanField(
                default=False,
                help_text="When on, retention purge skips this workspace (compliance).",
            ),
        ),
        migrations.AlterField(
            model_name="platformopsevent",
            name="action",
            field=models.CharField(
                choices=[
                    ("provision", "Provision tenant"),
                    ("suspend", "Suspend tenant"),
                    ("reactivate", "Reactivate tenant"),
                    ("update", "Update tenant"),
                    ("invite", "Invite admin"),
                    ("invite_resend", "Resend invite"),
                    ("invite_revoke", "Revoke invite"),
                    ("demo_reset", "Reset demo workspace"),
                    ("media_audit", "Media orphan audit"),
                    ("media_delete", "Delete media orphans"),
                    ("form_seed", "Seed form library"),
                    ("support_snapshot", "View support snapshot"),
                    ("trial_extended", "Extend free trial"),
                    ("subscription_activated", "Mark subscription active"),
                    ("impersonate", "Start support impersonation"),
                    ("export", "Export tenant data"),
                    ("compliance_export", "Compliance audit export"),
                    ("delete", "Delete tenant workspace"),
                    ("plan_changed", "Change tenant plan"),
                    ("staff_role", "Change platform staff role"),
                ],
                db_index=True,
                max_length=64,
            ),
        ),
        migrations.CreateModel(
            name="SupportImpersonation",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "token",
                    models.CharField(blank=True, db_index=True, max_length=64, unique=True),
                ),
                ("actor_email", models.EmailField(blank=True, max_length=254)),
                ("expires_at", models.DateTimeField()),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="support_impersonations_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "target_user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="support_impersonations_received",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="support_impersonations",
                        to="tenants.tenant",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="EmailDeliveryEvent",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "event_type",
                    models.CharField(
                        choices=[
                            ("delivery", "Delivery"),
                            ("bounce", "Bounce"),
                            ("complaint", "Spam complaint"),
                            ("open", "Open"),
                            ("click", "Click"),
                            ("other", "Other"),
                        ],
                        db_index=True,
                        max_length=32,
                    ),
                ),
                ("recipient", models.EmailField(blank=True, db_index=True, max_length=254)),
                (
                    "tenant_slug",
                    models.SlugField(blank=True, db_index=True, max_length=63),
                ),
                (
                    "message_id",
                    models.CharField(blank=True, db_index=True, max_length=255),
                ),
                ("subject", models.CharField(blank=True, max_length=512)),
                ("description", models.TextField(blank=True)),
                ("raw", models.JSONField(blank=True, default=dict)),
                (
                    "tenant",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="email_delivery_events",
                        to="tenants.tenant",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
