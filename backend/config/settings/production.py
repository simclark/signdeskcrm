from .base import *  # noqa: F401,F403
import os

DEBUG = False
# Prefer Host subdomain in production; Vite proxy header override is local-only.
TENANT_ALLOW_HEADER_SLUG = os.getenv("TENANT_ALLOW_HEADER_SLUG", "false").lower() == "true"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

SECURE_SSL_REDIRECT = os.getenv("SECURE_SSL_REDIRECT", "true").lower() == "true"
SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = os.getenv("SECURE_HSTS_PRELOAD", "false").lower() == "true"
SECURE_REFERRER_POLICY = "same-origin"

# Comma-separated origins, e.g. https://signdeskcrm.com,https://www.signdeskcrm.com
_csrf = os.getenv("CSRF_TRUSTED_ORIGINS", "")
CSRF_TRUSTED_ORIGINS = [o.strip() for o in _csrf.split(",") if o.strip()]

# Fail closed if someone deploys production with the example secret.
if SECRET_KEY in ("dev-insecure-change-me", "dev-change-me-in-production-use-32chars-min") or len(
    SECRET_KEY
) < 32:
    raise RuntimeError(
        "DJANGO_SECRET_KEY must be a unique value of at least 32 characters in production."
    )

if DO_SPACES_BUCKET and (not DO_SPACES_KEY or not DO_SPACES_SECRET):
    raise RuntimeError(
        "DO_SPACES_KEY and DO_SPACES_SECRET are required when DO_SPACES_BUCKET is set."
    )

_sentry_dsn = os.getenv("SENTRY_DSN", "").strip()
if _sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.django import DjangoIntegration

    sentry_sdk.init(
        dsn=_sentry_dsn,
        integrations=[DjangoIntegration(), CeleryIntegration()],
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0")),
        send_default_pii=False,
        environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
    )
