# SignDeskCRM

Multi-tenant e-signature + lightweight CRM built with Django 5, DRF, React, Mantine, MySQL, Redis, Celery, and Mailpit.

## Stack

- **Backend:** Django 5 + Django REST Framework + SimpleJWT
- **Frontend:** Vite + React + TypeScript + Mantine 8
- **Data:** Single shared MySQL database with row-level `tenant_id` isolation
- **Tenancy:** Subdomain slugs (`acme-esign.signdeskcrm.test` → tenant `acme-esign`; production `*.signdeskcrm.com`)
- **Async:** Celery + Redis (invites, reminders, PDF flatten, certificates)
- **Dev email:** Mailpit (`http://localhost:8026`; ProgressPhase uses `8025` when both run locally)

## Quick start

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
docker compose up --build
```

### Local DNS (`/etc/hosts`)

`.test` domains do not auto-resolve. Add entries (or use dnsmasq for `*.signdeskcrm.test`):

```text
127.0.0.1 signdeskcrm.test www.signdeskcrm.test platform.signdeskcrm.test acme-esign.signdeskcrm.test
```

Add a line for each workspace slug you create (for example `globex.signdeskcrm.test`).

Services:

| Service | URL |
|---|---|
| Marketing (apex) | http://signdeskcrm.test:5173 or http://www.signdeskcrm.test:5173 |
| Platform (staff) | http://platform.signdeskcrm.test:5173 |
| Tenant login | http://acme-esign.signdeskcrm.test:5173 (redirects `/` → `/login`) |
| API (direct host) | http://localhost:8001/api/health/ |
| Mailpit | http://localhost:8026 |
| MySQL | localhost:3307 |
| Redis | localhost:6379 |

Browser traffic uses the Vite proxy on `:5173` → `api:8000` inside Docker; `API_HOST_PORT` is only for host tools (curl, Postman).

### Running beside ProgressPhase

Keep separate containers per product. SignDesk defaults are shifted so both stacks can bind host ports at once:

| Resource | ProgressPhase | SignDeskCRM |
|---|---|---|
| HTTP / HTTPS | Traefik `80` / `443` | — (Vite `:5173` + `*.signdeskcrm.test`) |
| Web / apps | `3001`–`3003` | `5173` (`FRONTEND_PORT`) |
| API (host) | `8000` (`API_PORT`) | `8001` (`API_HOST_PORT`) |
| MySQL (host) | `3306` (`MYSQL_PORT`) | `3307` (`MYSQL_HOST_PORT`) |
| Redis (host) | — | `6379` (`REDIS_HOST_PORT`) |
| Mailpit UI | `8025` (`MAILPIT_PORT`) | `8026` (`MAILPIT_UI_PORT`) |
| Mailpit SMTP (host) | — (internal `1025`) | `1026` (`MAILPIT_SMTP_PORT`) |

In-container service ports are unchanged (`mysql:3306`, `api:8000`, `mailpit:1025`, `redis:6379`).

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

Live demo walkthrough: [docs/demo/ESIGN_DEMO.md](docs/demo/ESIGN_DEMO.md)

## Form library, listings & CRM outreach

Horizontal capabilities (first design partner: real estate — see `docs/design-partner/`):

- **Form library** — dual shelf: SignDesk platform starters (auto-copied on workspace signup / Form library list) plus tenant-published templates (`Add to library`). Platform rows have a `library_key` and are clone-only; customize via Clone.
- **Import** — `POST /api/templates/import/` (PDF AcroForm + optional JSON field map), then optionally promote into the library
- **Listings** — manual or CSV import → envelope prepare prefill
- **Follow-ups & follow-up plans** — agent tasks plus envelope-triggered email sequences (stalled / declined / completed)

Ops backfill / refresh of platform starters (internal only — not a customer tool):

```bash
cd backend
python manage.py seed_form_library --tenant-slug acme-esign
# or: python manage.py seed_form_library --all-tenants [--replace]
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
# DigitalOcean (managed MySQL + Spaces + Traefik/Let's Encrypt)
docker compose -f docker-compose.prod.yml -f docker-compose.prod.do.yml up --build -d

# Or bundled MySQL in Compose:
# docker compose -f docker-compose.prod.yml --profile builtin-mysql up --build -d
```

Production hosts use `signdeskcrm.com` / `{slug}.signdeskcrm.com`. Traefik terminates TLS (Let's Encrypt DNS-01 on DigitalOcean). See [docs/ops/PRODUCTION.md](docs/ops/PRODUCTION.md) for DNS, ACME, secrets, SMTP, private media, backups, and Sentry. Design-partner pilot ops: [docs/design-partner/PILOT_OPS.md](docs/design-partner/PILOT_OPS.md).
