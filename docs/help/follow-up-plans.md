# Follow-up plans

**Follow-up plans** are automated email sequences tied to envelope events. Use them so stalled, declined, or completed packets still get timely outreach without building each message by hand.

Open **Follow-up plans** in the left nav. Attach a plan on an [envelope](envelopes.md) detail page.

> Older URLs may say “cadences.” That name redirects here — the product term is **Follow-up plans**.

## Triggers

| Trigger | When it fires |
|---|---|
| **Signer idle after send (stalled)** | No progress for the configured idle period; can replace or complement default signing reminders depending on setup |
| **Recipient declined** | Someone declined to sign |
| **Envelope completed** | All required signing finished |

## Build a plan

1. Choose **New** (or edit an existing plan).
2. Set the trigger.
3. Add **email steps** with offsets (for example day 0, day 2, day 5).
4. Write subject and body; insert placeholders where supported, such as:
   - `{{recipient_name}}`
   - `{{envelope_title}}`
   - `{{sign_link}}`
   - `{{listing_address}}` (when listings/prefill data exists)
5. Optionally add an **agent handoff** task so a person follows up in addition to email.
6. Save.

## Attach to an envelope

On the envelope detail page, select the follow-up plan so that envelope uses it when the trigger conditions are met.

## Tips

- Keep stalled sequences short and clear; include the sign link so recipients can finish in one click.
- Align tone with your branded [email templates](settings.md#email) in Settings.
- Use [Follow-ups](follow-ups.md) for one-off human tasks; use plans for repeatable envelope-driven outreach.
- Test with an internal envelope before attaching a plan to client packets.
