from django.apps import AppConfig


class CommonConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.common"
    label = "common"

    def ready(self):
        # Register post_delete / pre_save media cleanup.
        from apps.common import signals  # noqa: F401
