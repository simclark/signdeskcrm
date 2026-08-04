# Production launch checklist
#
# Pair with docs/design-partner/PILOT_OPS.md for partner onboarding.

## Prerequisites

1. Unique secrets (never commit these):
   - `DJANGO_SECRET_KEY` — ≥32 random characters
   - MySQL password (managed DB or Compose)
   - `DO_AUTH_TOKEN` — DigitalOcean API token with **read/write** on Domains (ACME DNS-01)
   - Spaces keys + SMTP credentials
2. DNS on **DigitalOcean** (required for Traefik wildcard certs):
   - Apex `A` → droplet IP
   - `www` `A` or `CNAME` → apex / droplet
   - Wildcard `*.yourdomain.com` `A` → droplet IP (tenants + `platform`)
3. Managed MySQL CA (if using DO Databases): `deploy/certs/mysql-ca.crt`

TLS is automatic via **Traefik + Let's Encrypt** (DNS-01 / DigitalOcean). You do not place `fullchain.pem` / `privkey.pem` for this stack.

## Example `.env` (production)

```env
DJANGO_SETTINGS_ENV=production
DJANGO_SECRET_KEY=<generate-a-long-random-string>
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=.signdeskcrm.com,signdeskcrm.com
CSRF_TRUSTED_ORIGINS=https://signdeskcrm.com,https://www.signdeskcrm.com

# Managed MySQL (DigitalOcean)
MYSQL_DATABASE=signdeskcrm
MYSQL_USER=signdesk
MYSQL_PASSWORD=<strong>
MYSQL_HOST=....db.ondigitalocean.com
MYSQL_PORT=25060
MYSQL_SSL_CA=/certs/mysql-ca.crt

CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
CELERY_TASK_ALWAYS_EAGER=false

EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USE_TLS=true
EMAIL_HOST_USER=...
EMAIL_HOST_PASSWORD=...
DEFAULT_FROM_EMAIL=SignDesk <noreply@signdeskcrm.com>

# Preferred on DigitalOcean (Postmark HTTPS API — avoids blocked :587):
SMTP_PROVIDER=postmark
POSTMARK_SERVER_TOKEN=<server-api-token>
DEFAULT_FROM_EMAIL=SignDesk <noreply@signdeskcrm.com>
SUPPORT_EMAIL=support@signdeskcrm.com

# Optional Redis auth (also set matching CELERY_* URLs):
# REDIS_PASSWORD=<strong>
# CELERY_BROKER_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
# CELERY_RESULT_BACKEND=redis://:${REDIS_PASSWORD}@redis:6379/0

# Production Host-only tenant resolution (default when DJANGO_SETTINGS_ENV=production):
# TENANT_ALLOW_HEADER_SLUG=false

BASE_DOMAIN=signdeskcrm.com
FRONTEND_PROTOCOL=https
API_PROTOCOL=https
FRONTEND_PORT=
VITE_BASE_DOMAIN=signdeskcrm.com

# Traefik / Let's Encrypt (DNS-01 via DigitalOcean)
ACME_EMAIL=ops@signdeskcrm.com
DO_AUTH_TOKEN=<digitalocean-api-token-with-domain-write>
# Escape dots in BASE_DOMAIN for Traefik v3 HostRegexp
BASE_DOMAIN_REGEX=signdeskcrm\.com

# DigitalOcean Spaces — private bucket for PDFs / signatures / certificates
DO_SPACES_BUCKET=signdesk-media
DO_SPACES_KEY=<spaces-access-key>
DO_SPACES_SECRET=<spaces-secret>
DO_SPACES_REGION=nyc3
DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com

SECURE_SSL_REDIRECT=true
SENTRY_DSN=https://...@o....ingest.sentry.io/...
SENTRY_ENVIRONMENT=production
LOG_LEVEL=INFO
```

Leave `FRONTEND_PORT` empty for standard HTTPS (tenant `host()` omits port when not on `.test`).

## Traefik + Let's Encrypt

Edge flow:

```text
Internet → Traefik :80/:443 (TLS, HTTP→HTTPS)
        → nginx :80 (internal) → api / static SPA
```

1. Create a DigitalOcean **Personal Access Token** with Domains read/write.
2. Set `ACME_EMAIL` and `DO_AUTH_TOKEN` in `.env`.
3. Point DNS at the droplet **before** first start (ACME creates `_acme-challenge` TXT records via the DO API).
4. Traefik requests a cert for `BASE_DOMAIN` + `*.BASE_DOMAIN` and stores it in the `traefik_letsencrypt` volume.

Check issuance:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.prod.do.yml logs traefik | grep -i acme
```

## DigitalOcean Managed MySQL

1. Create a database/user (e.g. `signdeskcrm` / `signdesk`).
2. **Trusted sources** → add the droplet’s public IP (or VPC).
3. Download the **CA certificate** → save as `deploy/certs/mysql-ca.crt`.
4. Point `.env` at the managed host (`MYSQL_HOST`, port `25060`, `MYSQL_SSL_CA=/certs/mysql-ca.crt`).
5. Do **not** start the Compose `mysql` service (it uses profile `builtin-mysql`).

## DigitalOcean Spaces

E-sign PDFs, signed copies, certificates, signature images, and tenant branding are stored in Spaces when `DO_SPACES_BUCKET` is set. Objects stay **private**; the app streams them through `/api/media/` and signing routes (nginx never serves `/media/` directly).

Object keys are tenant-scoped:

```text
tenants/<tenant_id>/documents/<YYYY>/<MM>/<file>.pdf
tenants/<tenant_id>/signed/<YYYY>/<MM>/…
tenants/<tenant_id>/certificates/<YYYY>/<MM>/…
tenants/<tenant_id>/signatures/<YYYY>/<MM>/…
tenants/<tenant_id>/branding/logo|icon/…
```

After deploying a release that introduces this layout, rewrite legacy flat keys
for the demo tenant once:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.prod.do.yml \
  exec api python manage.py migrate_media_to_tenant_paths
docker compose -f docker-compose.prod.yml -f docker-compose.prod.do.yml \
  exec api python manage.py migrate_media_to_tenant_paths --apply
```

(Defaults to slug `demo`. Use `--all-tenants` or `--tenant-slug <slug>` later if needed.)

1. Create a Space (e.g. `signdesk-media` in `nyc3`).
2. API → Spaces Keys → generate key + secret.
3. Set the `DO_SPACES_*` variables above. Keep the bucket private (no public listing).

Without `DO_SPACES_BUCKET`, media uses the Docker `media_data` volume (local filesystem).

## Deploy

```bash
# Place mysql-ca.crt for managed DB; DNS must already point at this droplet

docker compose -f docker-compose.prod.yml -f docker-compose.prod.do.yml up --build -d

# Self-hosted MySQL in Compose instead of managed:
# docker compose -f docker-compose.prod.yml --profile builtin-mysql up --build -d

curl -fsS https://yourdomain.com/api/health/
```

On first `api` start, `entrypoint.sh` runs `migrate` against MySQL (schema create/update). Worker/beat skip migrations.

Health returns `checks.database` and `checks.redis`. Expect HTTP 200 when both are ok.

## Media privacy

Production nginx does **not** expose `/media/`. PDFs are served only via:

- `/api/media/<path>` — JWT + tenant membership + ownership
- `/api/sign/<token>/document/` and `/download/` — signing-token access

Branding assets under `tenant_logos/` and `tenant_icons/` remain publicly readable through `/api/media/` (needed on the guest signing page).

With Spaces enabled, those same paths are object keys in the bucket; the API still authorizes and streams them.

## Platform console (staff)

Primary ops surface for partner lifecycle. Prefer Platform over CLI for routine work.

1. Create a staff user (one-time bootstrap):

   ```bash
   docker compose -f docker-compose.prod.yml -f docker-compose.prod.do.yml exec api python manage.py createsuperuser
   ```

2. Log in at **https://platform.yourdomain.com/login** (local: http://platform.signdeskcrm.test:5173/login). Apex `/platform` redirects there. Staff only.
3. **Tenants** — provision partners, suspend/reactivate, edit contacts, send/resend/revoke admin invites, refresh starter forms, open a read-only support snapshot.
4. **Health** — database/redis checks plus `BASE_DOMAIN` / signing-host warnings before pitches.
5. **Media orphans** — report (and optionally delete) files on disk with no DB reference.
6. **Audit log** — who provisioned, suspended, reset demo, deleted orphans, etc.
7. **Demo workspace** — reset the reserved `demo` tenant before pitches.

Add `platform.yourdomain.com` to DNS (wildcard `*.yourdomain.com` covers it). Locally add `platform.signdeskcrm.test` to `/etc/hosts`.

### Orphaned media (storage control)

Django CASCADE deletes remove DB rows but **do not** remove FieldFiles from disk.
SignDesk now:

1. Deletes field files on model delete / replace (signals in `apps.common.signals`)
2. Offers Platform → **Media orphans** (preferred) and a break-glass CLI

```bash
# Break-glass CLI (Platform UI preferred)
docker compose exec api python manage.py audit_media_orphans
docker compose exec api python manage.py audit_media_orphans --delete
docker compose exec api python manage.py audit_media_orphans --prefix documents --prefix signed
```

Also run after bulk tenant cleanup. Retention purge (`document_retention_days`) only clears completed envelope signed/certificate downloads — it does not replace this audit.

Break-glass CLI equivalents (use when Platform is unavailable):

```bash
docker compose exec api python manage.py provision_tenant --name "..." --slug ... --owner-email ... --password ...
docker compose exec api python manage.py reset_demo_tenant
```

## Backups

See [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) for managed MySQL, Spaces, and restore drills.

```bash
chmod +x deploy/backup.sh
./deploy/backup.sh ./backups
```

Schedule daily via cron. Store off-host. Test restore before launch. For managed MySQL, also enable DO automated backups.

## Observability

- Set `SENTRY_DSN` to enable error tracking (Django + Celery).
- Scrape `/api/health/` from uptime monitoring (database + Redis). Example: UptimeRobot / Better Stack HTTP monitor every 60s expecting HTTP 200 and `"status":"ok"`.
- Platform → Health also surfaces **Celery heartbeat**, `SUPPORT_EMAIL`, and config warnings (beat must be running for Celery to stay green).
- Keep Celery worker + beat logs attached to your log drain.

## Admin

Restrict `/admin/` with [deploy/admin-acl.conf](../../deploy/admin-acl.conf) (mounted into nginx). Default allows all; add `allow`/`deny` lines for office/VPN IPs, then reload nginx. Use strong staff passwords.
