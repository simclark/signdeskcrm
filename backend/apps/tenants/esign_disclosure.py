"""ESIGN Act / UETA disclosure defaults for electronic records and signatures.

This copy is structured for counsel review. It supports US ESIGN Act and
applicable Uniform Electronic Transactions Act (UETA) consent practices.
"""

from __future__ import annotations

import hashlib

# Prior short default — used only to migrate tenants still on stock text.
LEGACY_ESIGN_ACKNOWLEDGEMENT = (
    "By continuing, you agree to conduct this transaction electronically, "
    "to receive records electronically, and that your electronic signature "
    "is legally binding. You may request a paper copy and withdraw consent "
    "by contacting the sender."
)

DEFAULT_ESIGN_ACKNOWLEDGEMENT_VERSION = "2026-07"

DEFAULT_ESIGN_ACKNOWLEDGEMENT = """\
ELECTRONIC RECORDS AND SIGNATURES DISCLOSURE

Please read this disclosure carefully before continuing. By checking the box
and selecting Continue, you affirmatively consent to use electronic records
and electronic signatures for this transaction under the Electronic Signatures
in Global and National Commerce Act (E-SIGN Act) and the applicable Uniform
Electronic Transactions Act (UETA).

1. Scope of consent
Your consent covers the documents in this envelope, related notices, and other
records provided electronically in connection with this transaction (including
completion notices and downloadable copies of signed documents).

2. Intent and legal effect
Your electronic signature (including typed or drawn signatures and initials)
shows your intent to sign and is legally binding to the same extent as a
handwritten signature under applicable law.

3. Hardware and software requirements
To access and retain these electronic records you need:
• A device with an internet connection
• A current web browser (such as Chrome, Firefox, Safari, or Edge)
• Software that can view and download Portable Document Format (PDF) files

4. Ability to access electronic records
By continuing, you confirm that you can access and retain PDF documents using
the hardware and software described above.

5. Paper copies
You may request a paper (non-electronic) copy of these records by contacting
the sender of this envelope (or the workspace that sent it) using the email
address or other contact information in the invitation. The sender may charge
a reasonable fee for paper copies if permitted by law and their policy.

6. Withdrawing consent
You may withdraw your consent to receive electronic records by contacting the
sender before you complete your signature. Withdrawal is prospective only: it
does not affect the validity of electronic records or signatures already given
for this transaction. If you withdraw before signing, the sender may provide
paper records or cancel the transaction according to their process.

7. Updating your contact information
To update the email address used for electronic delivery of records related to
this transaction, contact the sender promptly so future notices reach you.

8. Obtaining and retaining copies
After this envelope is completed, you may download the signed PDF and the
Certificate of Completion using the link in your invitation or completion
email (no account required while the link remains valid). You may also request
copies from the sender. Retention of completed records on the platform is
controlled by the sending workspace; keep your own copies for your records.

9. Questions
If you have questions about this disclosure or need assistance accessing these
records, contact the sender of this envelope.
"""


def sha256_text(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def resolve_acknowledgement(tenant) -> tuple[str, str]:
    """Return (text, version) for the tenant's current disclosure."""
    text = (getattr(tenant, "esign_acknowledgement", None) or "").strip()
    if not text:
        text = DEFAULT_ESIGN_ACKNOWLEDGEMENT
    version = (
        getattr(tenant, "esign_acknowledgement_version", None)
        or DEFAULT_ESIGN_ACKNOWLEDGEMENT_VERSION
    )
    return text, version
