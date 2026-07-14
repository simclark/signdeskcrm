# Design partner pilot (Mitchell / Shapiro Group)

SignDesk stays a **horizontal** e-sign + light CRM product. Shapiro Group is the first design partner to validate workflows that other industries can reuse (form library, merge/prefill, listing import, follow-ups).

## Goals

1. Run SignDesk in parallel with DocuSign on a subset of standard packets.
2. Confirm multi-signer order, reminders, and Certificate of Completion meet their comfort bar.
3. Capture a gap list from 2–3 real packets before investing in library/import/MLS automation.
4. Convert successful pilot into a discounted paid workspace.

## How to start the pilot

1. Create a workspace for Shapiro (or invite Mitchell into an existing tenant).
2. Agree commercial terms using [BETA_TERMS.md](./BETA_TERMS.md).
3. Seed the sample form library into their tenant:

```bash
cd backend
python manage.py seed_form_library --tenant-slug <their-slug>
```

4. Have them upload official TREC PDFs they already use → Templates → place fields / clone from library patterns.
5. Send 2–3 practice envelopes (Buyer + Seller sequential).
6. Fill [PILOT_CHECKLIST.md](./PILOT_CHECKLIST.md) after each packet.

## What we deliberately do not build in Phase 0

- ZipForm / NAR form database
- Full DocuSign template fidelity import (Phase 2)
- Live MLS connector (Phase 3 starts with CSV listing import)
- Texas-only product branding
