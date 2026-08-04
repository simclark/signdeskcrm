# Design-partner pilot ops

Checklist to run SignDesk with **real email** and a **hosted tenant URL** for Shapiro / Mitchell (or any Phase 0 partner). Pair with [README.md](./README.md), [BETA_TERMS.md](./BETA_TERMS.md), [PILOT_CHECKLIST.md](./PILOT_CHECKLIST.md), and the Platform control-plane runbook [PLATFORM_OPS.md](../ops/PLATFORM_OPS.md) (staff roles, offboard, billing ownership).

## 1. Hosted environment

1. Provision a host (or staging VM) and deploy with:

   ```bash
   cp .env.example .env
   # edit production values — see docs/ops/PRODUCTION.md
   docker compose -f docker-compose.prod.yml up --build -d
   ```

2. Set DNS:
   - Apex / www → your load balancer or host
   - Wildcard `*.signdeskcrm.com` (or your pilot domain) → same host
3. Env must match DNS:

   | Variable | Pilot example |
   |----------|----------------|
   | `BASE_DOMAIN` | `signdeskcrm.com` |
   | `FRONTEND_PROTOCOL` / `API_PROTOCOL` | `https` |
   | `FRONTEND_PORT` | blank / `443` (omit non-standard ports in URLs) |
   | `VITE_BASE_DOMAIN` | same as `BASE_DOMAIN` (frontend build arg) |
   | `DJANGO_ALLOWED_HOSTS` | `.signdeskcrm.com,signdeskcrm.com` |
   | `DJANGO_SETTINGS_ENV` | `production` |

Signing links are built as `{tenant.frontend_url}/sign/{token}`. If `BASE_DOMAIN` or protocol is wrong, Mailpit-style demos still work locally but partner inboxes get broken links.

## 2. Real email (Postmark preferred)

Preferred on DigitalOcean (outbound :587 often blocked) — HTTP API on :443:

```env
SMTP_PROVIDER=postmark
POSTMARK_SERVER_TOKEN=<server-api-token>
DEFAULT_FROM_EMAIL=SignDesk <noreply@signdeskcrm.com>
SUPPORT_EMAIL=support@signdeskcrm.com
```

SMTP alternative:

```env
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USE_TLS=true
EMAIL_HOST_USER=...
EMAIL_HOST_PASSWORD=...
DEFAULT_FROM_EMAIL=SignDesk <noreply@yourdomain.com>
SUPPORT_EMAIL=support@yourdomain.com
```

Before first live packet:

- [ ] SPF / DKIM / DMARC for the From domain (configure in DNS + Postmark sender signature)
- [ ] Send a test workspace invite and a practice envelope invite to the partner’s real inbox
- [ ] Confirm links open on phone + desktop
- [ ] Confirm bounce/complaint visibility in Postmark and Platform → Email events (webhook)

Celery **worker** and **beat** must be running or invites / trial warnings never leave the queue. Platform → Health shows a Celery heartbeat check once beat has written within ~5 minutes.

## 3. Partner workspace

1. Provision via **Platform** at https://platform.yourdomain.com (local: http://platform.signdeskcrm.test:5173) — staff login. After provision, use the handoff dialog for invite/workspace links.

   Break-glass CLI:

   ```bash
   docker compose exec api python manage.py provision_tenant \
     --name "Shapiro Realty" \
     --slug shapiro \
     --owner-email mitchell@partner.com \
     --password '<temporary>'
   ```

2. Have them upload official board/partner PDFs → Templates → place fields, then **Add to library** for Shared library reuse.
3. Add members via **Administration → Settings → Members** (invite, change role, deactivate).
4. Agree commercial terms using [BETA_TERMS.md](./BETA_TERMS.md).
5. Optionally customize email templates (CC notice, void, decline, completion) under Settings.

Reset the pitch demo workspace between live demos from Platform → **Demo workspace** (type `RESET` to confirm), or break-glass:

```bash
docker compose exec api python manage.py reset_demo_tenant
```

Before a pitch, glance at Platform → **Health** for database/redis and `BASE_DOMAIN` warnings.

## 4. First practice packets

1. Upload official TREC (or partner) PDFs → Templates → place fields.
2. Send 2–3 **Buyer + Seller sequential** practice envelopes to real addresses.
3. After each packet, fill [PILOT_CHECKLIST.md](./PILOT_CHECKLIST.md).
4. Confirm comfort with Certificate of Completion + audit before expanding volume.

## 5. Counsel glance (disclosure + CoC)

Default ESIGN/UETA disclosure lives in `backend/apps/tenants/esign_disclosure.py` and is overridable per tenant in Settings. Structure is intentional; **wording is not a legal sign-off**.

Before treating the pilot as evidence-grade:

- [ ] Counsel reviews default acknowledgement text (or tenant override)
- [ ] Counsel reviews a sample Certificate of Completion (hashes, consent snapshot, signer events)
- [ ] Document any required wording changes in the pilot gap list

See [COUNSEL_REVIEW.md](./COUNSEL_REVIEW.md).

## 6. Set expectations (Phase 0)

Deliberately out of scope — disclose up front:

- Single PDF per envelope (no multi-doc packets)
- Magic-link signer auth only (no SMS / access code / KBA)
- No ZipForm / NAR catalog or live MLS
- Parallel DocuSign use expected until packet types are trusted

## 7. Go / no-go for paid conversion

Per beta terms: partner completes N practice envelopes of a given packet type **without needing DocuSign for that type**, then convert to a discounted paid workspace.
