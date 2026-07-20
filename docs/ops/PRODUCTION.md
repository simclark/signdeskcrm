# Production launch checklist
#
# Pair with docs/design-partner/PILOT_OPS.md for partner onboarding.

## Prerequisites

1. Unique secrets (never commit these):
   - `DJANGO_SECRET_KEY` — ≥32 random characters
   - `MYSQL_PASSWORD` / `MYSQL_ROOT_PASSWORD`
   - SMTP credentials
2. DNS:
   - Apex + `www`
   - Wildcard `*.yourdomain.com` for tenant subdomains
3. TLS certificates in `deploy/certs/`:
   - `fullchain.pem`
   - `privkey.pem`

### Self-signed (staging only)

```bash
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout deploy/certs/privkey.pem \
  -out deploy/certs/fullchain.pem \
  -subj "/CN=signdeskcrm.com"
```

### Let's Encrypt (production)

Use certbot on the host (or a sidecar) and copy/symlink into `deploy/certs/`, or bind-mount `/etc/letsencrypt/live/<domain>/`.

## Example `.env` (production)

```env
DJANGO_SETTINGS_ENV=production
DJANGO_SECRET_KEY=<generate-a-long-random-string>
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=.signdeskcrm.com,signdeskcrm.com
CSRF_TRUSTED_ORIGINS=https://signdeskcrm.com,https://www.signdeskcrm.com

MYSQL_DATABASE=signdesk
MYSQL_USER=signdesk
MYSQL_PASSWORD=<strong>
MYSQL_ROOT_PASSWORD=<strong>
MYSQL_HOST=mysql
MYSQL_PORT=3306

CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
CELERY_TASK_ALWAYS_EAGER=false

EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USE_TLS=true
EMAIL_HOST_USER=...
EMAIL_HOST_PASSWORD=...
DEFAULT_FROM_EMAIL=SignDesk <noreply@signdeskcrm.com>

BASE_DOMAIN=signdeskcrm.com
FRONTEND_PROTOCOL=https
API_PROTOCOL=https
FRONTEND_PORT=
VITE_BASE_DOMAIN=signdeskcrm.com

SECURE_SSL_REDIRECT=true
SENTRY_DSN=https://...@o....ingest.sentry.io/...
SENTRY_ENVIRONMENT=production
LOG_LEVEL=INFO
```

Leave `FRONTEND_PORT` empty for standard HTTPS (tenant `host()` omits port when not on `.test`).

## Deploy

```bash
# Place TLS certs first
docker compose -f docker-compose.prod.yml up --build -d
curl -fsS https://yourdomain.com/api/health/
```

Health returns `checks.database` and `checks.redis`. Expect HTTP 200 when both are ok.

## Media privacy

Production nginx does **not** expose `/media/`. PDFs are served only via:

- `/api/media/<path>` — JWT + tenant membership + ownership
- `/api/sign/<token>/document/` and `/download/` — signing-token access

Branding assets under `tenant_logos/` and `tenant_icons/` remain publicly readable through `/api/media/` (needed on the guest signing page).

## Backups

```bash
chmod +x deploy/backup.sh
./deploy/backup.sh ./backups
```

Schedule daily via cron. Store off-host. Test restore before launch.

## Observability

- Set `SENTRY_DSN` to enable error tracking (Django + Celery).
- Scrape `/api/health/` from uptime monitoring.
- Keep Celery worker + beat logs attached to your log drain.

## Admin

Restrict `/admin/` at the network layer when possible; use a strong owner password.
