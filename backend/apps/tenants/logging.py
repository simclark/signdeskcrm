import logging


class TenantContextFilter(logging.Filter):
    def filter(self, record):
        from apps.tenants.middleware import get_current_tenant

        tenant = get_current_tenant()
        record.tenant_id = getattr(tenant, "id", "-")
        return True
