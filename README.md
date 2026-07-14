# SignDeskCRM

Multi-tenant e-signature + lightweight CRM built with Django 5, DRF, React, Mantine, MySQL, Redis, Celery, and Mailpit.

## Stack

- **Backend:** Django 5 + Django REST Framework + SimpleJWT
- **Frontend:** Vite + React + TypeScript + Mantine 8
- **Data:** Single shared MySQL database with row-level `tenant_id` isolation
- **Tenancy:** Subdomain slugs (`acme-esign.signdeskcrm.test` → tenant `acme-esign`; production `*.signdeskcrm.com`)
- **Async:** Celery + Redis (invites, reminders, PDF flatten, certificates)
- **Dev email:** Mailpit (`http://localhost:8025`)

## Quick start

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
docker compose up --build
```

### Local DNS (`/etc/hosts`)

`.test` domains do not auto-resolve. Add entries (or use dnsmasq for `*.signdeskcrm.test`):

```text
127.0.0.1 signdeskcrm.test www.signdeskcrm.test acme-esign.signdeskcrm.test
```

Add a line for each workspace slug you create (for example `globex.signdeskcrm.test`).

Services:

| Service | URL |
|---|---|
| Marketing (apex) | http://signdeskcrm.test:5173 or http://www.signdeskcrm.test:5173 |
| Tenant login | http://acme-esign.signdeskcrm.test:5173 (redirects `/` → `/login`) |
| API | http://localhost:8000/api/health/ |
| Mailpit | http://localhost:8025 |
| MySQL | localhost:3306 |

### Create a workspace

1. Open http://signdeskcrm.test:5173/signup
2. Company name e.g. `Acme Esign, Inc`
3. Slug e.g. `acme-esign`
4. You are redirected to `http://acme-esign.signdeskcrm.test:5173/app`

Ensure the new slug is in `/etc/hosts` before the redirect.

### Local API development without Docker frontend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# point MYSQL_HOST=127.0.0.1 in .env after compose starts mysql
python manage.py migrate
python manage.py runserver
```

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Tenant model

- One MySQL database, shared schema
- Every tenant-owned row has a non-null `tenant` FK
- Middleware resolves tenant from `Host` subdomain or `X-Tenant-Slug`
- Memberships gate access (`owner` / `admin` / `member`)
- Apex / `www` hosts show marketing; tenant subdomains go to login at `/`

## Core product flows

1. Sign up → tenant + owner
2. Add contacts / companies
3. Upload PDF documents
4. Compose envelope (recipients + fields)
5. Send → Mailpit invite → `/sign/:token`
6. Consent → complete fields → submit
7. Signed PDF + Certificate of Completion + audit trail

## Form library, listings & CRM outreach

Horizontal capabilities (first design partner: real estate — see `docs/design-partner/`):

- **Form library** — curated templates with named roles + merge tokens (`seed_form_library --tenant-slug …`)
- **Import** — `POST /api/templates/import/` (PDF AcroForm + optional JSON field map)
- **Listings** — manual or CSV import → envelope prepare prefill
- **Follow-ups & cadences** — contact nurture tasks and email sequences

```bash
cd backend
python manage.py seed_form_library --tenant-slug acme-esign
```

## Tests

```bash
cd backend
CELERY_TASK_ALWAYS_EAGER=true MYSQL_HOST=127.0.0.1 python manage.py test apps.tenants
# Offline unit tests (no MySQL):
python manage.py test apps.documents.tests_merge_import
```

## Production

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Production hosts use `signdeskcrm.com` / `{slug}.signdeskcrm.com`. See `deploy/nginx.conf` for reverse-proxy routing of API, media, and SPA.
