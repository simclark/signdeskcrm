# Counsel review — ESIGN disclosure and Certificate of Completion

This note is for design-partner legal / compliance review. It is **not** a legal opinion and does not replace counsel.

## What SignDesk captures today

| Artifact | Purpose |
|----------|---------|
| Affirmative consent checkbox before signing APIs succeed | ESIGN §101(c)-style consumer consent practice |
| Immutable consent snapshot per signer (text, version, SHA-256, IP, UA) | Evidence of what was agreed at sign time |
| Append-only audit trail | Sent / viewed / consent / signed / declined / voided / completed / downloaded |
| Flattened signed PDF | Final record of field values |
| Certificate of Completion | Human-readable evidence pack with integrity hashes |

Default disclosure text and version constant:

- Module: `backend/apps/tenants/esign_disclosure.py`
- Version key: `DEFAULT_ESIGN_ACKNOWLEDGEMENT_VERSION` (e.g. `2026-07`)
- Tenant override: Administration → Settings → E-signature

## Review checklist

Ask counsel to confirm or revise:

1. **Disclosure wording** — scope of consent, hardware/software requirements, withdrawal, paper copies, retention language
2. **Consumer vs commercial** — whether partner packets are B2B-only (UETA) or may include consumer transactions (ESIGN)
3. **Certificate of Completion** — whether hashes, consent version, and event table meet title/lender comfort
4. **Signer authentication** — magic-link email possession only; whether access codes / SMS are required for their packet types
5. **Retention** — workspace `document_retention_days` vs firm policy / legal hold needs
6. **Jurisdiction** — US ESIGN/UETA focus; not eIDAS / qualified signatures

## How to change disclosure after review

1. Edit tenant acknowledgement in Settings (preferred for one partner), **or**
2. Update `DEFAULT_ESIGN_ACKNOWLEDGEMENT` + bump `DEFAULT_ESIGN_ACKNOWLEDGEMENT_VERSION` for all new workspaces
3. Existing signers keep their snapshotted text; new signers get the new version

## Sample review packet

Generate one completed practice envelope and provide counsel:

1. Signed PDF download
2. Certificate of Completion PDF
3. Envelope audit JSON / UI export
4. Current disclosure text from Settings (or defaults)

Track outcomes in [PILOT_CHECKLIST.md](./PILOT_CHECKLIST.md) under “Certificate + audit comfort”.

## Sign-off tracker

Counsel must complete this before treating production packets as evidence-grade. Product/engineering cannot mark these done unilaterally.

| Item | Owner | Status | Date | Notes |
|------|-------|--------|------|-------|
| Disclosure wording approved (or tenant override applied) | Counsel | Pending | | |
| Consumer vs commercial scope confirmed | Counsel | Pending | | |
| Certificate of Completion sample approved | Counsel | Pending | | |
| Signer auth (magic link) accepted for packet types | Counsel | Pending | | |
| Retention / legal-hold policy documented | Partner + counsel | Pending | | |

When all rows are **Approved**, update [PILOT_OPS.md](./PILOT_OPS.md) §5 and record the counsel name/date in the partner workspace notes.
