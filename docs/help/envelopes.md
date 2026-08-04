# Envelopes

An **envelope** is a document packet you send for signature: a PDF, one or more recipients, signature fields, and optional message. This is the core of SignDesk.

Open **Envelopes** in the left nav, or use **New envelope** in the header.

## Envelope statuses

| Status | Meaning |
|---|---|
| **Draft** | Not sent yet; you can still prepare and edit |
| **Sent** | Invites went out; waiting for activity |
| **In progress** | At least one signer has started |
| **Completed** | All required signers finished |
| **Voided** | Cancelled by your team |
| **Declined** | A signer declined |
| **Expired** | Passed the expiration date without completion |

Recipient statuses include **Pending**, **Sent**, **Viewed**, **Signed**, **Declined**, and **Not required** (for example CC).

## Envelopes list

The **Envelopes** table lists every packet. Open a row for the full detail page, or use the **⋯** menu on a row for common actions without leaving the list.

| Action | When it appears |
|---|---|
| **Open** | Always |
| **Rename** | Always — changes the display title (including after send) |
| **Prepare / edit** | Draft |
| **Send for signature** | Draft |
| **Resend invites** | Sent or in progress |
| **Duplicate** | Always — opens the new draft on Prepare |
| **Download signed PDF** / **Download certificate** | Completed (when files exist) |
| **Void…** | Sent or in progress |
| **Delete…** | Draft only |

## Send your first envelope

### 1. Create

1. Click **New envelope** in the header.
2. Choose a source:
   - Upload a PDF, or
   - Pick an existing [Document](documents.md), or
   - Start from a [Template](templates-and-form-library.md)
3. Set a **title** and optional message to recipients.
4. Continue to **Prepare**.

### 2. Prepare

On the prepare screen you:

1. **Add recipients**
   - **Signer** — must complete assigned fields
   - **CC** — receives a copy; does not sign
2. Choose **routing**:
   - **Sequential** — one signer at a time, in order
   - **Parallel** — all signers invited at once
3. **Place fields** on the PDF (drag or click to add):
   - Signature, Initials, Date, Text, Checkbox
4. Assign each field to a recipient, or set fill mode to **Complete before send** for values you fill before sending (stamped into the PDF on send).
5. On Prepare, type those values under **Complete before send**. When Prefill records is on, you can optionally **Fill from a listing**.
6. Optionally expand **Templates** to apply a saved layout or **Save as template** for reuse (collapsed by default).
7. **Save** to keep progress, **Save & continue** to open the envelope detail page, or **Send for signature** at the bottom when everything is ready.

### 3. Send for signature

You can send from:

- **Prepare** — **Send for signature** at the bottom of the sidebar (validates recipients, signature fields, and required complete-before-send values, then emails invites), or
- **Envelope detail** — **Send for signature** on a draft, or
- **Envelopes list** — **⋯ → Send for signature** on a draft

Each signer receives a **Signing invitation** email with a secure link. CCs receive a copy notice when appropriate.

What signers see: [Signing experience](signing.md).

## Envelope detail

After create (and after send), the detail page is your control center.

### Actions

| Action | When to use |
|---|---|
| **Prepare** / edit | Change recipients or fields while still a draft (and where editing is still allowed) |
| **Send for signature** | Email signing invites — this is when the packet leaves Draft |
| **Resend invites** | Someone lost the email or link |
| **Void** | Stop the envelope; notify as configured |
| **Duplicate** | Start a similar packet from this one |
| **Regenerate certificate** | Rebuild the Certificate of Completion if needed |
| Attach a **Follow-up plan** | Automate stalled / declined / completed outreach — see [Follow-up plans](follow-up-plans.md) |

Many of these are also available from the **⋯** menu on the Envelopes list.

### Downloads and proof

When available:

- **Original PDF** — the file before signing
- **Signed PDF** — fields flattened into the document
- **Certificate of Completion** — consent, hashes, and completion details
- **Audit trail** — timeline of sent, viewed, consented, signed, completed, and related events

## Field fill modes

| Mode | Behavior |
|---|---|
| **Signer completes** | Recipient fills the field during signing |
| **Complete before send** | You enter the value on Prepare; it is stamped into the PDF when you send |

Optionally bind a complete-before-send field to a **data source** (merge token) so **Fill fields** can pull from a listing, contact, role, or deal terms. Prefill records are optional — see [Listings](listings.md). Typing values by hand always works.

## Tips

- Prefer **Sequential** when one party must sign before another (buyer then seller).
- Use **CC** for brokers or managers who only need a copy.
- Link recipients to [Contacts](contacts.md) when possible so history and follow-ups stay attached.
- Check **Expiring soon** on the [Dashboard](dashboard.md) so packets do not time out unnoticed.
- Set default expiration and reminder timing under [Settings → E-signature](settings.md#e-signature).
