# E-Sign demo script (5–7 minutes)

Use this script for live pitches. Goal: show a trustworthy **Buyer → Seller sequential** signing loop ending in a signed PDF, Certificate of Completion, and audit trail.

## Before you start (hard gate)

1. `docker compose up --build` — wait until healthy.
2. Confirm:
   - API: http://localhost:8001/api/health/
   - Frontend apex: http://signdeskcrm.test:5173
   - Mailpit: http://localhost:8026
   - **Celery worker + beat are running** (without the worker, invites and PDF finalize stall)
3. `/etc/hosts` includes:
   ```text
   127.0.0.1 signdeskcrm.test www.signdeskcrm.test platform.signdeskcrm.test demo.signdeskcrm.test
   ```
4. Optional: clear Mailpit so invites are easy to find.

## Setup (once per machine, or before each pitch)

Reset the reserved **`demo`** workspace (Buyer/Seller contacts + role accounts). Prefer **Platform → Demo workspace** at http://platform.signdeskcrm.test:5173/demo (staff login; type `RESET` to confirm). Glance at **Platform → Health** before the pitch.

Break-glass CLI:

```bash
docker compose exec api python manage.py reset_demo_tenant
```

Reset seeds three accounts (shared password `demo-pass-123` unless you pass `--password`):

| Role | Email | Access |
|---|---|---|
| Owner | `owner@demo.signdeskcrm.test` | Full access including Settings and member management |
| Admin | `admin@demo.signdeskcrm.test` | Day-to-day work + Settings (cannot change Owner) |
| Member | `member@demo.signdeskcrm.test` | Envelopes, documents, templates, CRM — **no Settings** |

Log in at http://demo.signdeskcrm.test:5173/login. To show roles: Member has no Settings nav; Admin/Owner do.

The `demo` slug is reserved for Platform reset — do not create it via signup.

For the pitch, upload a sample PDF under **Documents** / **Templates** (or use an existing workspace template). Shared library starts empty until an Admin publishes a template.
## Demo narrative (what to say)

> SignDesk is multi-tenant e-sign with a light CRM. Watch a standard packet go from prepare → email invite → ESIGN consent → signature → flattened PDF and Certificate of Completion with an audit trail.

## Walkthrough

### 1. Contacts (30s)

- Open **Contacts** — **Buyer Ada** and **Seller Sam** are pre-seeded after `reset_demo_tenant` (or add manually)
- Say: *“Recipients can be CRM contacts so follow-ups and history stay attached.”*

### 2. Create envelope from a template (60s)

- **Templates** → create or open a template (or **Documents** → upload a familiar PDF → create template)
- Optionally **Add to library** (Admin) so it appears under **Shared library**
- **Envelopes** (or header **New envelope**)
  - Title: `Demo Purchase Agreement`
  - Recipients: Buyer Ada (order 1), Seller Sam (order 2), routing **Sequential**
  - Optional: add a CC to show copy-only notice (not “Review and sign”)
- Place at least one **signature** (and ideally a **date**) per signer → **Save** → **Send for signature**

### 3. Buyer signs via Mailpit (90s)

- Open Mailpit → invite to `buyer@example.com` → open signing link
- Show **ESIGN/UETA disclosure** → check consent → Continue
- Adopt signature (draw or type) → complete fields → **Submit**
- Say: *“Consent text is snapshotted with version and hash for the Certificate of Completion.”*

### 4. Seller signs (60s)

- Mailpit → seller invite (sent after buyer completes in sequential routing)
- Consent → sign → submit
- Envelope status becomes **Completed**

### 5. Proof artifacts (90s)

Back in the workspace envelope detail:

1. Open **Signed PDF** — fields flattened in place
2. Open **Certificate of Completion** — integrity hashes, consent, signer events
3. Open **Audit** — sent / viewed / consent / signed / completed

Say: *“This is the evidence pack title and counsel typically want to review in a pilot.”*

## Optional failure paths (if asked)

| Scenario | How |
|----------|-----|
| Decline | On signing UI, decline with a reason → sender gets a declined email |
| Void | Envelope detail → Void → parties get a void notice; old links return 410 |
| Resend | Only reminds signers who already have an active turn (not future sequential signers) |

## Troubleshooting mid-demo

| Symptom | Check |
|---------|--------|
| No invite email | Mailpit + Celery **worker** logs |
| Stuck “In progress” after last signer | Celery **worker** (finalize / flatten task) |
| Wrong signing host in email | `BASE_DOMAIN`, `FRONTEND_PROTOCOL`, `FRONTEND_PORT` in `.env` |
| 401 mid-demo | SPA auto-refreshes JWT; if still failing, re-login |

## Do not demo as “done”

Call these out as pilot limitations if asked:

- Single PDF per envelope (no multi-doc packets yet)
- Magic-link signer auth only (no SMS / access code)
- Design-partner Phase 0 — not DocuSign feature parity
