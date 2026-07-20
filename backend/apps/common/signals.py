"""Keep media storage in sync when FileField-bearing rows are removed or replaced."""

from __future__ import annotations

from django.db.models.signals import post_delete, pre_save
from django.dispatch import receiver

from apps.common.media_inventory import safe_delete_field_file
from apps.documents.models import DocumentVersion
from apps.envelopes.models import Envelope, SignatureAsset
from apps.tenants.models import Tenant


def _delete_replaced_file(sender, instance, field_name: str, **kwargs):
    if not instance.pk:
        return
    try:
        previous = sender.objects.filter(pk=instance.pk).only(field_name).get()
    except sender.DoesNotExist:
        return
    old = getattr(previous, field_name)
    new = getattr(instance, field_name)
    old_name = getattr(old, "name", None) or ""
    new_name = getattr(new, "name", None) or ""
    if old_name and old_name != new_name:
        safe_delete_field_file(old)


@receiver(post_delete, sender=DocumentVersion)
def delete_document_version_file(sender, instance, **kwargs):
    safe_delete_field_file(instance.file)


@receiver(post_delete, sender=Envelope)
def delete_envelope_files(sender, instance, **kwargs):
    safe_delete_field_file(instance.signed_file)
    safe_delete_field_file(instance.certificate_file)


@receiver(post_delete, sender=SignatureAsset)
def delete_signature_asset_file(sender, instance, **kwargs):
    safe_delete_field_file(instance.image)


@receiver(post_delete, sender=Tenant)
def delete_tenant_branding_files(sender, instance, **kwargs):
    safe_delete_field_file(instance.logo)
    safe_delete_field_file(instance.icon)


@receiver(pre_save, sender=DocumentVersion)
def replace_document_version_file(sender, instance, **kwargs):
    _delete_replaced_file(sender, instance, "file")


@receiver(pre_save, sender=Envelope)
def replace_envelope_files(sender, instance, **kwargs):
    _delete_replaced_file(sender, instance, "signed_file")
    _delete_replaced_file(sender, instance, "certificate_file")


@receiver(pre_save, sender=SignatureAsset)
def replace_signature_asset_file(sender, instance, **kwargs):
    _delete_replaced_file(sender, instance, "image")


@receiver(pre_save, sender=Tenant)
def replace_tenant_branding_files(sender, instance, **kwargs):
    _delete_replaced_file(sender, instance, "logo")
    _delete_replaced_file(sender, instance, "icon")
