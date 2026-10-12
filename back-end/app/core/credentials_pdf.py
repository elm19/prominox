import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from xml.sax.saxutils import escape

from app.config import settings

def build_credentials_pdf(*, name: str, username: str, password: str, issued_by: str, reset: bool) -> bytes:
    """One-page sheet handed to the user. Contains the clear-text password, so it is only built on demand."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=25 * mm, rightMargin=25 * mm, topMargin=25 * mm, bottomMargin=20 * mm,
        title=f"Prominox credentials - {username}", author="Prominox",
    )
    brand = colors.HexColor("#b45309")
    muted = colors.HexColor("#555555")
    h_brand = ParagraphStyle("brand", fontName="Helvetica-Bold", fontSize=11, textColor=brand, spaceAfter=2)
    h_title = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=22, spaceAfter=4)
    body = ParagraphStyle("body", fontName="Helvetica", fontSize=10.5, leading=15, textColor=colors.black)
    small = ParagraphStyle("small", parent=body, fontSize=9, textColor=muted)
    label = ParagraphStyle("label", parent=small, fontName="Helvetica-Bold")
    value = ParagraphStyle("value", fontName="Courier-Bold", fontSize=15, leading=20)
    plain = ParagraphStyle("plain", fontName="Helvetica", fontSize=12, leading=16)

    def row(title: str, content: str, style: ParagraphStyle):
        return [Paragraph(title.upper(), label), Paragraph(escape(content), style)]

    table = Table(
        [
            row("Name", name, plain),
            row("Username", username, value),
            row("Temporary password", password, value),
            row("Sign in at", settings.APP_URL, plain),
        ],
        colWidths=[45 * mm, 115 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LINEBELOW", (0, 0), (-1, -2), 0.5, colors.HexColor("#dddddd")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#999999")),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#faf7f2")),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )

    story = [
        Paragraph("PROMINOX", h_brand),
        Paragraph("Password reset" if reset else "Account credentials", h_title),
        Paragraph(f"Issued {datetime.now().strftime('%d %B %Y, %H:%M')} by {escape(issued_by)}", small),
        Spacer(1, 12 * mm),
        table,
        Spacer(1, 10 * mm),
        Paragraph("<b>How to sign in</b>", body),
        Spacer(1, 2 * mm),
        Paragraph(
            "1. Open the address above and enter the username and temporary password exactly as printed.<br/>"
            "2. You will be asked to choose your own password straight away. This temporary password stops "
            "working once you do.<br/>"
            "3. Afterwards you can change your password and add your email from the Account page.",
            body,
        ),
        Spacer(1, 8 * mm),
        Paragraph(
            "<b>Keep this sheet private.</b> Anyone holding it can sign in as you until you choose your own "
            "password. Hand it over in person and destroy it afterwards. If you forget your password, ask an "
            "administrator for a new sheet.",
            body,
        ),
    ]
    doc.build(story)
    return buffer.getvalue()
