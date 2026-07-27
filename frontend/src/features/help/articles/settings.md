# Settings

**Settings** is for workspace **Owners** and **Admins** only. Open **Settings** in the left nav under administration.

Members do not see this page. See [Roles and permissions](roles-and-permissions.md).

Settings has five tabs: **Workspace**, **Branding**, **Email**, **E-signature**, and **Members**.

---

## Workspace

Configure who the account is and which optional modules are on.

### Company

- **Display name** — shown in the app header and on signing pages
- **Legal company name** — official registered name if different
- **Website** — public site on account records

### Business address

Mailing or registered address for the company.

### Primary contact

Main person for the account (separate from signer-facing support under E-signature).

### Modules

| Module | Effect |
|---|---|
| **Prefill records** | Shows **Listings** in the nav and lets envelopes pull shared details into document fields. Off by default. |

Details: [Listings / Prefill records](listings.md).

---

## Branding

Customize how SignDesk appears to your team and in outbound email headers.

| Setting | Purpose |
|---|---|
| **Accent color** | Product accent for the workspace |
| **Icon** | Small mark (favicons / compact places) |
| **Company logo** | Larger logo for emails and branded surfaces |

Upload clear images; changes apply for teammates and branded emails after save.

---

## Email

Customize transactional messages SignDesk sends. Your logo or icon from Branding appears in the email header.

Typical templates include:

- Workspace invitation
- Password reset
- Signing invitation
- Signing reminder
- CC copy notice
- Document completed
- Envelope voided
- Envelope declined

For each template you can edit **subject**, **body**, and use placeholders (click to insert). Preview before saving. Plain text newlines become paragraphs in the email.

---

## E-signature

Defaults for sending, certificates, reminders, support contact, and legal disclosure.

### Signing defaults

| Setting | Purpose |
|---|---|
| **Timezone** | Certificate timestamps and signing activity times |
| **Default expiration** | Days until unsigned envelopes expire after send |
| **Retention period** | Days completed PDFs stay downloadable (blank = keep forever) |

### Reminders

| Setting | Purpose |
|---|---|
| **Send automatic reminders** | When off, only manual resends from the envelope |
| **Reminder interval** | Hours between reminder emails |
| **Maximum reminders** | Per signer (`0` = unlimited) |

Reminder **copy** is edited under the **Email** tab.

### Sender contact

Shown to signers for paper-copy requests, withdrawal of consent, and support:

- Support email
- Support phone (optional)
- Paper-copy fee policy (optional; also on the certificate when set)

### E-signature disclosure

Legal notice shown before signers continue (ESIGN/UETA consent, paper copies, withdrawal, records).

- Saving creates a **new version**; signers keep a snapshot of the text they accepted.
- Editing does not change disclosures already accepted on past envelopes.
- **Restore default** returns to the product default text.

---

## Members

Manage who can access the workspace.

### Roster

- View active members and roles
- Promote or demote **Admin ↔ Member**
- Deactivate members who should no longer access the app

### Invitations

1. **Invite a member** with email and role:
   - **Member — day-to-day access**
   - **Admin — can manage settings**
2. Pending invites: **Resend** or **Revoke**
3. Invitees open the email link, set a password, and join (invites expire after 7 days)

You cannot invite someone as Owner.

---

## Profile (all users)

Account name and password live under the avatar menu → **Profile**, not under Settings. Email is read-only.
