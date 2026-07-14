from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


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
