import io
import os

from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def _get_logo_path(organisation):
    if not organisation or not organisation.logo_color:
        return None
    try:
        path = organisation.logo_color.path
        if os.path.exists(path):
            return path
    except Exception:
        pass
    return None


def _format_user(user):
    if not user:
        return "-"
    name = f"{(user.first_name or '').strip()} {(user.last_name or '').strip()}".strip()
    if name and user.email:
        return f"{name} ({user.email})"
    return name or user.email or "-"


def _format_datetime(dt):
    if not dt:
        return "-"
    return timezone.localtime(dt).strftime("%b %d, %Y %H:%M")


def _build_styles(primary_color=None):
    styles = getSampleStyleSheet()
    accent = primary_color or "#3b82f6"

    styles.add(ParagraphStyle(
        "PDFTitle",
        parent=styles["Title"],
        fontSize=18,
        textColor=colors.HexColor("#1a1a1a"),
        spaceAfter=4,
    ))

    styles.add(ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontSize=13,
        textColor=colors.HexColor(accent),
        spaceBefore=16,
        spaceAfter=6,
        borderPadding=(0, 0, 2, 0),
    ))

    styles.add(ParagraphStyle(
        "SubHeading",
        parent=styles["Heading3"],
        fontSize=11,
        textColor=colors.HexColor("#374151"),
        spaceBefore=10,
        spaceAfter=4,
    ))

    styles.add(ParagraphStyle(
        "InfoLabel",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#6b7280"),
    ))

    styles.add(ParagraphStyle(
        "InfoValue",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#111827"),
    ))

    styles.add(ParagraphStyle(
        "MessageContent",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#1f2937"),
        leftIndent=8,
        borderPadding=(4, 4, 4, 4),
    ))

    styles.add(ParagraphStyle(
        "MessageMeta",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#6b7280"),
    ))

    styles.add(ParagraphStyle(
        "FooterText",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#9ca3af"),
        alignment=1,
    ))

    styles.add(ParagraphStyle(
        "OrgName",
        parent=styles["Normal"],
        fontSize=12,
        textColor=colors.HexColor("#1a1a1a"),
        fontName="Helvetica-Bold",
    ))

    styles.add(ParagraphStyle(
        "OrgAddress",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#6b7280"),
    ))

    styles.add(ParagraphStyle(
        "CellText",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#374151"),
    ))

    styles.add(ParagraphStyle(
        "CellHeader",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#1a1a1a"),
        fontName="Helvetica-Bold",
    ))

    return styles


TABLE_STYLE = TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f9fafb")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#374151")),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 8),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
])


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff"}
MAX_IMAGE_WIDTH = 120 * mm
MAX_IMAGE_HEIGHT = 80 * mm


def _get_attachment_image(attachment):
    if not attachment:
        return None
    try:
        ext = os.path.splitext(attachment.name)[1].lower()
        if ext not in IMAGE_EXTENSIONS:
            return None
        path = attachment.path
        if not os.path.exists(path):
            return None
        img = Image(path)
        iw, ih = img.drawWidth, img.drawHeight
        if iw > MAX_IMAGE_WIDTH:
            ratio = MAX_IMAGE_WIDTH / iw
            iw = MAX_IMAGE_WIDTH
            ih = ih * ratio
        if ih > MAX_IMAGE_HEIGHT:
            ratio = MAX_IMAGE_HEIGHT / ih
            ih = MAX_IMAGE_HEIGHT
            iw = iw * ratio
        img.drawWidth = iw
        img.drawHeight = ih
        img.hAlign = "LEFT"
        return img
    except Exception:
        return None


def generate_consultation_pdf(consultation, appointments, messages, organisation):
    buffer = io.BytesIO()
    primary_color = organisation.primary_color_practitioner if organisation else None
    styles = _build_styles(primary_color)

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
    )

    elements = []

    _add_header(elements, styles, organisation, consultation)
    _add_consultation_details(elements, styles, consultation)
    _add_custom_fields(elements, styles, consultation)
    _add_people(elements, styles, consultation)
    _add_appointments(elements, styles, appointments)
    _add_messages(elements, styles, messages)
    _add_footer(elements, styles, organisation)

    doc.build(elements)
    buffer.seek(0)
    return buffer


def _add_header(elements, styles, organisation, consultation):
    if organisation:
        logo_path = _get_logo_path(organisation)
        header_parts = []

        if logo_path:
            try:
                logo = Image(logo_path)
                max_w, max_h = 50 * mm, 20 * mm
                iw, ih = logo.drawWidth, logo.drawHeight
                if iw > max_w:
                    ratio = max_w / iw
                    iw = max_w
                    ih = ih * ratio
                if ih > max_h:
                    ratio = max_h / ih
                    ih = max_h
                    iw = iw * ratio
                logo.drawWidth = iw
                logo.drawHeight = ih
                logo.hAlign = "LEFT"
                header_parts.append(logo)
            except Exception:
                pass

        if organisation.name:
            header_parts.append(Paragraph(organisation.name, styles["OrgName"]))

        address_parts = []
        if organisation.street:
            address_parts.append(organisation.street)
        city_parts = []
        if organisation.postal_code:
            city_parts.append(organisation.postal_code)
        if organisation.city:
            city_parts.append(organisation.city)
        if city_parts:
            address_parts.append(" ".join(city_parts))
        if organisation.country:
            address_parts.append(organisation.country)

        if address_parts:
            header_parts.append(Paragraph(", ".join(address_parts), styles["OrgAddress"]))

        for part in header_parts:
            elements.append(part)

        elements.append(Spacer(1, 8 * mm))

    title_text = consultation.title or f"Consultation #{consultation.pk}"
    elements.append(Paragraph(f"Consultation Report: {title_text}", styles["PDFTitle"]))
    elements.append(Spacer(1, 2 * mm))


def _add_consultation_details(elements, styles, consultation):
    elements.append(Paragraph("Consultation Details", styles["SectionHeading"]))

    status = "Closed" if consultation.closed_at else "Active"

    info_data = [
        ["Field", "Value"],
        ["ID", str(consultation.pk)],
        ["Title", consultation.title or "-"],
        ["Description", Paragraph(consultation.description or "-", styles["CellText"])],
        ["Status", status],
        ["Created", _format_datetime(consultation.created_at)],
    ]
    if consultation.closed_at:
        info_data.append(["Closed", _format_datetime(consultation.closed_at)])

    col_widths = [35 * mm, 140 * mm]
    table = Table(info_data, colWidths=col_widths)
    table.setStyle(TABLE_STYLE)
    elements.append(table)


def _add_custom_fields(elements, styles, obj):
    from .models import CustomFieldValue

    ct = ContentType.objects.get_for_model(obj)
    values = CustomFieldValue.objects.filter(
        content_type=ct, object_id=obj.pk
    ).select_related("custom_field").order_by("custom_field__ordering")

    if not values.exists():
        return

    elements.append(Paragraph("Additional Information", styles["SectionHeading"]))

    data = [["Field", "Value"]]
    for cfv in values:
        data.append([
            cfv.custom_field.name,
            Paragraph(cfv.value or "-", styles["CellText"]),
        ])

    col_widths = [35 * mm, 140 * mm]
    table = Table(data, colWidths=col_widths)
    table.setStyle(TABLE_STYLE)
    elements.append(table)


def _add_people(elements, styles, consultation):
    elements.append(Paragraph("People", styles["SectionHeading"]))

    data = [
        ["Role", "Name", "Email"],
    ]

    if consultation.beneficiary:
        b = consultation.beneficiary
        name = f"{(b.first_name or '').strip()} {(b.last_name or '').strip()}".strip() or "-"
        data.append(["Patient", name, b.email or "-"])

    if consultation.owned_by:
        o = consultation.owned_by
        name = f"{(o.first_name or '').strip()} {(o.last_name or '').strip()}".strip() or "-"
        data.append(["Practitioner", name, o.email or "-"])

    if consultation.created_by:
        c = consultation.created_by
        name = f"{(c.first_name or '').strip()} {(c.last_name or '').strip()}".strip() or "-"
        data.append(["Created By", name, c.email or "-"])

    if consultation.group:
        data.append(["Queue", consultation.group.name, "-"])

    if len(data) > 1:
        col_widths = [35 * mm, 70 * mm, 70 * mm]
        table = Table(data, colWidths=col_widths)
        table.setStyle(TABLE_STYLE)
        elements.append(table)


def _add_appointments(elements, styles, appointments):
    elements.append(Paragraph(f"Appointments ({appointments.count()})", styles["SectionHeading"]))

    if not appointments.exists():
        elements.append(Paragraph("No appointments", styles["InfoValue"]))
        return

    for i, appointment in enumerate(appointments):
        label = f"Appointment #{i + 1} - {appointment.get_type_display()}"
        elements.append(Paragraph(label, styles["SubHeading"]))

        data = [
            ["Field", "Value"],
            ["Type", appointment.get_type_display()],
            ["Status", appointment.get_status_display()],
            ["Scheduled At", _format_datetime(appointment.scheduled_at)],
        ]
        if appointment.end_expected_at:
            data.append(["Expected End", _format_datetime(appointment.end_expected_at)])
        if appointment.created_by:
            data.append(["Created By", _format_user(appointment.created_by)])

        col_widths = [35 * mm, 140 * mm]
        table = Table(data, colWidths=col_widths)
        table.setStyle(TABLE_STYLE)
        elements.append(table)

        participants = appointment.participant_set.filter(is_active=True).select_related("user")
        if participants.exists():
            elements.append(Spacer(1, 2 * mm))
            elements.append(Paragraph("Participants", styles["InfoLabel"]))

            p_data = [["Name", "Email", "Status", "Feedback"]]
            for p in participants:
                u = p.user
                name = f"{(u.first_name or '').strip()} {(u.last_name or '').strip()}".strip() or "-"
                feedback = ""
                if p.feedback_rate is not None:
                    feedback = f"{p.feedback_rate}/5"
                    if p.feedback_message:
                        feedback += f" - {p.feedback_message[:50]}"
                p_data.append([name, u.email or "-", p.status, feedback])

            col_widths = [40 * mm, 55 * mm, 30 * mm, 50 * mm]
            p_table = Table(p_data, colWidths=col_widths)
            p_table.setStyle(TABLE_STYLE)
            elements.append(p_table)

        elements.append(Spacer(1, 4 * mm))


def _add_messages(elements, styles, messages):
    count = messages.count()
    elements.append(Paragraph(f"Messages ({count})", styles["SectionHeading"]))

    if count == 0:
        elements.append(Paragraph("No messages", styles["InfoValue"]))
        return

    for msg in messages:
        author = _format_user(msg.created_by)
        time_str = _format_datetime(msg.created_at)
        edited = " (edited)" if msg.is_edited else ""
        meta_text = f"{author} - {time_str}{edited}"
        elements.append(Paragraph(meta_text, styles["MessageMeta"]))

        if msg.content:
            elements.append(Paragraph(msg.content, styles["MessageContent"]))

        if msg.attachment:
            img = _get_attachment_image(msg.attachment)
            if img:
                elements.append(Spacer(1, 1 * mm))
                elements.append(img)
            else:
                filename = os.path.basename(msg.attachment.name)
                elements.append(Paragraph(f"[Attachment: {filename}]", styles["MessageContent"]))

        elements.append(Spacer(1, 2 * mm))


def _add_footer(elements, styles, organisation):
    elements.append(Spacer(1, 10 * mm))

    if organisation and organisation.footer_practitioner:
        elements.append(Paragraph(organisation.footer_practitioner, styles["FooterText"]))
        elements.append(Spacer(1, 2 * mm))

    generated_at = timezone.localtime(timezone.now()).strftime("%b %d, %Y %H:%M")
    elements.append(Paragraph(f"Generated on {generated_at}", styles["FooterText"]))
