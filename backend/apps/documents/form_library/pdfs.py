from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

# Labels for optional-service-initials catalog form (must stay in sync with field_layout).
SERVICE_OPTION_LABELS = [
    "Home warranty",
    "Termite inspection",
    "Survey",
    "Appraisal",
    "Title insurance",
    "Escrow services",
    "HOA document review",
    "Septic inspection",
    "Roof inspection",
    "Pool inspection",
    "Mold inspection",
    "Radon testing",
    "Well inspection",
    "Flood certification",
    "Utility transfer",
    "Moving coordination",
    "Lock change",
    "Cleaning service",
    "Staging consult",
    "Post-close support",
]


def write_sample_purchase_agreement_pdf(path: str) -> None:
    c = canvas.Canvas(path, pagesize=letter)
    width, height = letter
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, height - 72, "Sample Purchase Agreement")
    c.setFont("Helvetica", 10)
    c.drawString(
        72,
        height - 96,
        "Demo form for SignDesk form library (not an official board form).",
    )
    c.drawString(72, height - 130, "Property address:")
    c.line(180, height - 132, 540, height - 132)
    c.drawString(72, height - 170, "Purchase price:")
    c.line(160, height - 172, 320, height - 172)
    c.drawString(340, height - 170, "MLS #:")
    c.line(380, height - 172, 540, height - 172)
    c.drawString(72, height - 230, "The parties agree to the purchase of the property on the terms above.")
    c.drawString(72, height - 280, "Buyer name:")
    c.line(150, height - 282, 360, height - 282)
    c.drawString(72, height - 350, "Buyer signature:")
    c.line(170, height - 352, 360, height - 352)
    c.drawString(380, height - 350, "Date:")
    c.line(415, height - 352, 540, height - 352)
    c.drawString(72, height - 420, "Seller name:")
    c.line(150, height - 422, 360, height - 422)
    c.drawString(72, height - 490, "Seller signature:")
    c.line(170, height - 492, 360, height - 492)
    c.drawString(380, height - 490, "Date:")
    c.line(415, height - 492, 540, height - 492)
    c.drawString(72, height - 560, "Facilitating agent completes property fields before send.")
    c.showPage()
    c.save()


def write_optional_service_initials_pdf(path: str) -> None:
    """One-page form: initial optional services you want, then sign."""
    c = canvas.Canvas(path, pagesize=letter)
    width, height = letter
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, height - 56, "Optional Service Elections")
    c.setFont("Helvetica", 10)
    c.drawString(
        72,
        height - 76,
        "Initial only the services you want. All service boxes are optional.",
    )
    c.drawString(72, height - 92, "QA / bug-repro form — not an official board form.")

    # Two columns of 10; coords match normalized field_layout in definitions.py
    # Field y is bottom-left origin; PDF drawString y is also from bottom.
    for i, label in enumerate(SERVICE_OPTION_LABELS):
        row = i % 10
        col = i // 10
        # Approximate PDF points from normalized layout (letter 612×792)
        label_x = 72 + col * 270
        # field y ≈ 0.82 - row*0.065 → center of initials box
        field_y_norm = 0.82 - row * 0.065
        line_y = field_y_norm * height + 8
        c.setFont("Helvetica", 9)
        c.drawString(label_x, line_y, f"{i + 1}. {label}")
        # Underline for initials (aligns with field x ≈ 0.42 / 0.87)
        init_x = (0.42 + col * 0.45) * width
        c.line(init_x, line_y - 2, init_x + 55, line_y - 2)
        c.setFont("Helvetica", 7)
        c.drawString(init_x, line_y - 12, "Initial")

    c.setFont("Helvetica", 10)
    c.drawString(72, 90, "Client signature:")
    c.line(170, 88, 380, 88)
    c.showPage()
    c.save()
