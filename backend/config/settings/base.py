import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-insecure-change-me")
DEBUG = os.getenv("DJANGO_DEBUG", "true").lower() == "true"
ALLOWED_HOSTS = [
    h.strip() for h in os.getenv("DJANGO_ALLOWED_HOSTS", "*").split(",") if h.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "apps.common.apps.CommonConfig",
    "apps.accounts",
    "apps.tenants",
    "apps.contacts",
    "apps.documents",
    "apps.envelopes",
    "apps.signing",
    "apps.audit",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.tenants.middleware.TenantMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

_db_options = {
    "charset": "utf8mb4",
    "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
}
# DigitalOcean Managed MySQL requires SSL. Download the cluster CA and set
# MYSQL_SSL_CA to its path inside the container (e.g. /certs/mysql-ca.crt).
_mysql_ssl_ca = os.getenv("MYSQL_SSL_CA", "").strip()
if _mysql_ssl_ca:
    _db_options["ssl"] = {"ca": _mysql_ssl_ca}
elif os.getenv("MYSQL_SSL_REQUIRED", "").lower() in ("1", "true", "yes"):
    # Enable TLS without a custom CA file (system trust store).
    _db_options["ssl"] = {}

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": os.getenv("MYSQL_DATABASE", "signdesk"),
        "USER": os.getenv("MYSQL_USER", "signdesk"),
        "PASSWORD": os.getenv("MYSQL_PASSWORD", "signdesk"),
        "HOST": os.getenv("MYSQL_HOST", "127.0.0.1"),
        "PORT": os.getenv("MYSQL_PORT", "3306"),
        "OPTIONS": _db_options,
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# DigitalOcean Spaces (S3-compatible). When DO_SPACES_BUCKET is set, media
# (PDFs, signatures, certificates, branding) goes to Spaces. Leave unset for
# local FileSystemStorage (dev default).
DO_SPACES_BUCKET = os.getenv("DO_SPACES_BUCKET", "").strip()
DO_SPACES_KEY = os.getenv("DO_SPACES_KEY", "").strip()
DO_SPACES_SECRET = os.getenv("DO_SPACES_SECRET", "").strip()
DO_SPACES_REGION = os.getenv("DO_SPACES_REGION", "nyc3").strip() or "nyc3"
DO_SPACES_ENDPOINT = os.getenv(
    "DO_SPACES_ENDPOINT",
    f"https://{DO_SPACES_REGION}.digitaloceanspaces.com",
).strip()
DO_SPACES_CDN_DOMAIN = os.getenv("DO_SPACES_CDN_DOMAIN", "").strip()

if DO_SPACES_BUCKET:
    # django-storages / boto3 use AWS_* names even for Spaces.
    AWS_ACCESS_KEY_ID = DO_SPACES_KEY
    AWS_SECRET_ACCESS_KEY = DO_SPACES_SECRET
    AWS_STORAGE_BUCKET_NAME = DO_SPACES_BUCKET
    AWS_S3_REGION_NAME = DO_SPACES_REGION
    AWS_S3_ENDPOINT_URL = DO_SPACES_ENDPOINT
    AWS_S3_CUSTOM_DOMAIN = DO_SPACES_CDN_DOMAIN or None
    AWS_DEFAULT_ACL = "private"
    AWS_QUERYSTRING_AUTH = True
    AWS_S3_OBJECT_PARAMETERS = {"CacheControl": "max-age=86400"}
    AWS_S3_FILE_OVERWRITE = False
    AWS_S3_SIGNATURE_VERSION = "s3v4"
    STORAGES = {
        "default": {"BACKEND": "storages.backends.s3boto3.S3Boto3Storage"},
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
        },
    }
else:
    STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
        },
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/min",
        "user": "600/min",
        "signup": "10/hour",
        "login": "30/min",
        "password_reset": "10/hour",
        "signing": "60/min",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https?://([\w-]+\.)?localhost(:\d+)?$",
    r"^https?://([\w-]+\.)?signdeskcrm\.test(:\d+)?$",
    r"^https?://([\w-]+\.)?signdeskcrm\.com(:\d+)?$",
    r"^https?://127\.0\.0\.1(:\d+)?$",
]

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)
CELERY_TASK_ALWAYS_EAGER = os.getenv("CELERY_TASK_ALWAYS_EAGER", "false").lower() == "true"
CELERY_BEAT_SCHEDULE = {
    "celery-heartbeat": {
        "task": "apps.common.tasks.celery_heartbeat",
        "schedule": 60.0,
    },
    "send-envelope-reminders": {
        "task": "apps.envelopes.tasks.send_due_reminders",
        "schedule": 3600.0,
    },
    "expire-envelopes": {
        "task": "apps.envelopes.tasks.expire_envelopes",
        "schedule": 900.0,
    },
    "purge-retained-documents": {
        "task": "apps.envelopes.tasks.purge_expired_retained_documents",
        "schedule": 3600.0,
    },
    "process-due-follow-ups": {
        "task": "apps.contacts.tasks.process_due_follow_ups",
        "schedule": 900.0,
    },
    "process-follow-up-plan-enrollments": {
        "task": "apps.contacts.tasks.process_follow_up_plan_enrollments",
        "schedule": 900.0,
    },
    "process-trial-lifecycle": {
        "task": "apps.tenants.tasks.process_trial_lifecycle",
        "schedule": 3600.0,
    },
}

# Free trial (Phase 1 — Stripe Checkout deferred)
TRIAL_DAYS = int(os.getenv("TRIAL_DAYS", "15"))
TRIAL_WARNING_HOURS = int(os.getenv("TRIAL_WARNING_HOURS", "24"))

# Platform support channel (trial banners, legal pages, billing placeholder)
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "support@signdeskcrm.com").strip()
# Flip true to force portal UI; also auto-enables when STRIPE_* are set
BILLING_PORTAL_AVAILABLE = os.getenv("BILLING_PORTAL_AVAILABLE", "false").lower() == "true"

# Stripe (optional — self-serve billing)
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
STRIPE_PRICE_ID = os.getenv("STRIPE_PRICE_ID", "").strip()
STRIPE_DEFAULT_PLAN = os.getenv("STRIPE_DEFAULT_PLAN", "professional").strip() or "professional"

# Postmark inbound webhooks (bounce / complaint / delivery)
POSTMARK_WEBHOOK_SECRET = os.getenv("POSTMARK_WEBHOOK_SECRET", "").strip()

# Allow X-Tenant-Slug to override Host (needed for Vite proxy). Disable in production.
TENANT_ALLOW_HEADER_SLUG = os.getenv("TENANT_ALLOW_HEADER_SLUG", "true").lower() == "true"

EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend"
)
EMAIL_HOST = os.getenv("EMAIL_HOST", "127.0.0.1")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "1025"))
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "false").lower() == "true"
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "SignDesk <noreply@signdeskcrm.com>")

# Postmark HTTP API (same approach as ProgressPhase prod) — preferred on DO
# droplets where outbound :587 is blocked. Set SMTP_PROVIDER=postmark.
SMTP_PROVIDER = os.getenv("SMTP_PROVIDER", "").strip().lower()
POSTMARK_SERVER_TOKEN = os.getenv("POSTMARK_SERVER_TOKEN", "").strip()
if SMTP_PROVIDER == "postmark" and POSTMARK_SERVER_TOKEN:
    EMAIL_BACKEND = "apps.common.postmark_backend.PostmarkAPIEmailBackend"
elif SMTP_PROVIDER == "postmark" and not POSTMARK_SERVER_TOKEN:
    raise RuntimeError("SMTP_PROVIDER=postmark requires POSTMARK_SERVER_TOKEN")

BASE_DOMAIN = os.getenv("BASE_DOMAIN", "signdeskcrm.test")
FRONTEND_PORT = os.getenv("FRONTEND_PORT", "5173")
FRONTEND_PROTOCOL = os.getenv("FRONTEND_PROTOCOL", "http")
API_PROTOCOL = os.getenv("API_PROTOCOL", "http")

MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "25"))
FILE_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = FILE_UPLOAD_MAX_MEMORY_SIZE

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "structured": {
            "format": "%(asctime)s %(levelname)s tenant=%(tenant_id)s %(name)s %(message)s",
        },
    },
    "filters": {
        "tenant_context": {
            "()": "apps.tenants.logging.TenantContextFilter",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "structured",
            "filters": ["tenant_context"],
        },
    },
    "root": {
        "handlers": ["console"],
        "level": os.getenv("LOG_LEVEL", "INFO"),
    },
}
