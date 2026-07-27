# Listings / Prefill records

**Prefill records** (shown in the nav as **Listings** when enabled) store shared details — often property- or listing-style — that can fill merge fields on envelopes so you type less and make fewer mistakes.

This module is **optional and off by default**.

## Turn the module on

Owners and admins:

1. Open **Settings → Workspace**.
2. Find **Modules**.
3. Enable **Prefill records**.

**Listings** then appears in the left navigation. If you open `/app/listings` while the module is off, the app explains how to enable it.

## What a listing holds

Typical fields include address, city, state, postal code, MLS number, price, beds, baths, square footage, and related details. Exact fields match what your workspace uses for merge/prefill.

Sources:

| Source | How |
|---|---|
| **Manual** | Add a listing in the UI |
| **CSV** | Import a file of records |

## Use on an envelope

1. Create or open an envelope and go to **Prepare**.
2. Select a listing / prefill record when the option is shown.
3. Merge fields and document-data fields that map to that record fill from the listing.

This works especially well with [Templates](templates-and-form-library.md) that already include merge tokens (for example listing address).

## Naming note

| Place | Label |
|---|---|
| Settings switch | **Prefill records** |
| Navigation | **Listings** |

Same feature — different labels in Settings vs nav.

## Tips

- Keep one listing per property or deal context you reuse often.
- Import CSV when onboarding a batch; fix a few records manually before sending live packets.
- Turn the module off if your team does not need it — the rest of SignDesk works without it.
