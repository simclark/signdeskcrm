# Platform ops — SignDesk control plane

SignDesk’s staff console at `platform.{BASE_DOMAIN}` is the **primary** surface for running the product. Prefer it over Django admin and CLI for routine work. ProgressPhase is a separate product; do not route SignDesk ops through it.

Pair with [PILOT_OPS.md](../design-partner/PILOT_OPS.md) (partner onboarding) and [PRODUCTION.md](./PRODUCTION.md) (deploy).

## Staff ownership

| Role | Who | May | May not |
|------|-----|-----|---------|
| **Viewer** | Read-only observers | List tenants, Health, Audit, usage | Mutate anything |
| **Support** | Partner help | Viewer + support snapshot, invites, extend trial, time-boxed impersonation | Provision, suspend, demo reset, media delete, mark paid, delete workspace |
| **Operator** | Day-2 ops | Support + provision, suspend/reactivate, demo reset, media orphan audit/delete | Mark subscription active, change plans, hard-delete tenants, change staff roles |
| **Admin** | Founders / lead ops | Everything including billing comps, plan changes, offboard/delete, staff role changes | — |

- All roles require `is_staff=True`. Superusers are treated as **Admin**.
- Existing staff without an explicit role are migrated to **Admin**.
- **Billing comps** (mark subscription active / extend trial beyond policy): Admin (or Support for trial extend only). Log every change in Platform → Audit.
- **Demo workspace** (`demo` slug): Operator+. Never provision a paying partner onto `demo`.

## Operating playbook (Phase A)

1. **Bootstrap** — `createsuperuser`, then log in at `https://platform.{domain}/login`.
2. **Pre-flight** — Platform → Health: DB, Redis, Celery heartbeat, `BASE_DOMAIN`, email config.
3. **Email** — Prove invite + signing link to a real inbox (SPF/DKIM/DMARC). Review Platform → Email events after Postmark webhooks are wired.
4. **Provision** — Platform → Tenants → Provision (UI). Use handoff dialog for workspace / invite URLs. CLI `provision_tenant` is break-glass only.
5. **Trial / comp** — Extend trial (+15/+30) from tenant detail; Admin marks subscription active for design partners until Stripe self-serve is used.
6. **Support** — Support snapshot first. Impersonation is time-boxed (1h), audited, and requires Support+. Disclose to partners in beta terms when used.
7. **Demo pitches** — Health → Demo workspace → type `RESET` → follow [ESIGN_DEMO.md](../demo/ESIGN_DEMO.md).
8. **Weekly** — Skim Audit log for unexpected suspends, comps, impersonations, media deletes.
9. **Backup** — Run a restore drill per [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) before treating pilots as durable.

## Locked decisions

1. **Platform is SignDesk-local** — `platform.signdeskcrm.*` only; no multi-product console.
2. **Support access** — Snapshot by default; audited impersonation available for Support+.
3. **Offboarding** — Export JSON from Platform, then hard-delete with typed slug confirmation (Admin). Suspend is the soft stop for non-paying / abusive workspaces.
4. **Billing until Stripe** — Admin marks active / Support extends trial; all actions hit `PlatformOpsEvent`.
5. **Staff growth** — Assign Viewer/Support/Operator before sharing destructive Admin capabilities.

## Offboard policy

1. Suspend the tenant if immediate access must stop.
2. Admin downloads **Export** (workspace metadata, members, envelope summaries).
3. For compliance requests, download **Compliance export** (audit trail + signing events).
4. Admin hard-deletes with confirm slug + `DELETE WORKSPACE`. Cascades tenant-owned rows; media orphans may remain until Media orphans cleanup.
5. Record partner offboard in your CRM/tickets outside SignDesk.

## Commercial / plans

| Plan | Seats | Envelopes / month | Listings module |
|------|-------|-------------------|-----------------|
| Starter | 3 | 25 | Off by default |
| Professional | 15 | 200 | Available |
| Enterprise | Unlimited | Unlimited | Available |

Trial workspaces use their assigned plan limits (default Starter). Stripe Checkout upgrades set `subscription_status=active` and may set plan from Price metadata. Platform Admins can override plan without Stripe.

## Quotas and status

- Seat limits apply when inviting / accepting members.
- Envelope monthly quota applies when **sending** (drafts do not count).
- Public `GET /api/status/` exposes coarse availability for uptime monitors (no secrets).
- Platform Health includes an SLO-style summary (check pass rate).

## Break-glass

```bash
docker compose exec api python manage.py provision_tenant ...
docker compose exec api python manage.py reset_demo_tenant
docker compose exec api python manage.py audit_media_orphans [--delete]
```

Django `/admin/` remains available behind optional nginx ACL; prefer Platform for audited actions.
