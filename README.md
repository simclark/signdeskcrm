# SignDeskCRM

Multi-tenant e-signature + lightweight CRM built with Django 5, DRF, React, Mantine, MySQL, Redis, Celery, and Mailpit.

## Stack

- **Backend:** Django 5 + Django REST Framework + SimpleJWT
- **Frontend:** Vite + React + TypeScript + Mantine 8
- **Data:** Single shared MySQL database with row-level `tenant_id` isolation
- **Tenancy:** Subdomain slugs (`acme-esign.localhost` → tenant `acme-esign`)
- **Async:** Celery + Redis (invites, reminders, PDF flatten, certificates)
- **Dev email:** Mailpit (`http://localhost:8025`)

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

Services:

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:8000/api/health/ |
| Mailpit | http://localhost:8025 |
| MySQL | localhost:3306 |

### Create a workspace

1. Open http://localhost:5173/signup
2. Company name e.g. `Acme Esign, Inc`
3. Slug e.g. `acme-esign`
4. You are redirected to `http://acme-esign.localhost:5173/app`

Modern browsers resolve `*.localhost` to `127.0.0.1` automatically.

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
npm install
npm run dev
```

## Tenant model

- One MySQL database, shared schema
- Every tenant-owned row has a non-null `tenant` FK
- Middleware resolves tenant from `Host` subdomain or `X-Tenant-Slug`
- Memberships gate access (`owner` / `admin` / `member`)

## Core product flows

1. Sign up → tenant + owner
2. Add contacts / companies
3. Upload PDF documents
4. Compose envelope (recipients + fields)
5. Send → Mailpit invite → `/sign/:token`
6. Consent → complete fields → submit
7. Signed PDF + Certificate of Completion + audit trail

## Tests

```bash
cd backend
CELERY_TASK_ALWAYS_EAGER=true MYSQL_HOST=127.0.0.1 python manage.py test apps.tenants
```

## Production

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

See `deploy/nginx.conf` for reverse-proxy routing of API, media, and SPA.
