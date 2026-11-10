from __future__ import annotations

import math
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
REFERENCE_DIR = ROOT / "reference"
TMP_DIR = ROOT / "tmp" / "pdfs" / "ai-feedforward-insert"
OUTPUT_DIR = ROOT / "output" / "pdf"

REPORT_GLOB = "*20261028_1200.pdf"
OUTPUT_NAME = (
    "(마포초)2026학년도 초등 학교교육력 제고 결과보고서_"
    "AI피드포워드 설명페이지 포함_20261030.pdf"
)

PAGE_WIDTH = 612.0
PAGE_HEIGHT = 790.0
INSERT_AT_INDEX = 10  # PDF 10쪽(보고서 인쇄면 8쪽) 다음

FONT_DIR = Path(r"C:\Windows\Fonts")
FONT_REGULAR = "HanSans"
FONT_BOLD = "HanSansBold"
FONT_BODY = "HanBatang"
FONT_BODY_BOLD = "HanBatangBold"

NAVY = colors.HexColor("#25458E")
BLUE = colors.HexColor("#3569BE")
TEAL = colors.HexColor("#71BDB9")
PALE_BLUE = colors.HexColor("#EAF1F8")
PALE_TEAL = colors.HexColor("#EAF6F4")
PALE_GRAY = colors.HexColor("#F3F4F5")
MID_GRAY = colors.HexColor("#D9DEE4")
TEXT = colors.HexColor("#15191E")
MUTED = colors.HexColor("#4D5965")
WHITE = colors.white


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont(FONT_REGULAR, str(FONT_DIR / "HanSantteutDotum-Regular.TTF")))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, str(FONT_DIR / "HanSantteutDotum-Bold.TTF")))
    pdfmetrics.registerFont(TTFont(FONT_BODY, str(FONT_DIR / "HANBatang.TTF")))
    pdfmetrics.registerFont(TTFont(FONT_BODY_BOLD, str(FONT_DIR / "HANBatangB.TTF")))


def paragraph_style(
    *,
    name: str,
    font: str = FONT_BODY,
    size: float = 9.0,
    leading: float | None = None,
    color: colors.Color = TEXT,
    align: int = TA_LEFT,
    left_indent: float = 0,
    right_indent: float = 0,
    space_after: float = 0,
) -> ParagraphStyle:
    return ParagraphStyle(
        name,
        fontName=font,
        fontSize=size,
        leading=leading or size * 1.42,
        textColor=color,
        alignment=align,
        leftIndent=left_indent,
        rightIndent=right_indent,
        spaceAfter=space_after,
        wordWrap="CJK",
        splitLongWords=True,
    )


BODY = paragraph_style(name="Body", size=9.0, leading=13.2)
BODY_SMALL = paragraph_style(name="BodySmall", size=8.1, leading=10.8)
BODY_TINY = paragraph_style(name="BodyTiny", size=7.4, leading=9.8, color=MUTED)
BOX_BODY = paragraph_style(name="BoxBody", size=8.2, leading=11.1, align=TA_CENTER)
FLOW_TITLE = paragraph_style(name="FlowTitle", font=FONT_BOLD, size=8.7, leading=10.4, align=TA_CENTER)
FLOW_BODY = paragraph_style(name="FlowBody", font=FONT_REGULAR, size=7.2, leading=9.2, color=MUTED, align=TA_CENTER)
TABLE_HEAD = paragraph_style(name="TableHead", font=FONT_BOLD, size=8.5, leading=10.5, align=TA_CENTER)
TABLE_CELL = paragraph_style(name="TableCell", size=7.9, leading=10.4)
TABLE_LABEL = paragraph_style(name="TableLabel", font=FONT_BOLD, size=8.0, leading=10.4, align=TA_CENTER)


def draw_paragraph(
    c: canvas.Canvas,
    text: str,
    style: ParagraphStyle,
    x: float,
    y_top: float,
    width: float,
    height: float,
) -> tuple[float, float]:
    paragraph = Paragraph(text, style)
    used_width, used_height = paragraph.wrap(width, height)
    paragraph.drawOn(c, x, y_top - used_height)
    return used_width, used_height


def draw_section_heading(c: canvas.Canvas, number: str, title: str, y: float) -> None:
    x = 85.0
    badge_w = 24.0
    badge_h = 20.0
    c.setFillColor(BLUE)
    c.roundRect(x, y, badge_w, badge_h, 2.5, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(FONT_BOLD, 10.5)
    c.drawCentredString(x + badge_w / 2, y + 5.2, number)
    c.setFillColor(PALE_BLUE)
    c.rect(x + badge_w + 6, y, 422.0, badge_h, fill=1, stroke=0)
    c.setFillColor(TEXT)
    c.setFont(FONT_BOLD, 11.2)
    c.drawString(x + badge_w + 15, y + 4.8, title)


def draw_role_box(
    c: canvas.Canvas,
    *,
    x: float,
    y: float,
    width: float,
    height: float,
    title: str,
    subtitle: str,
    body: str,
    header_color: colors.Color,
    body_color: colors.Color,
) -> None:
    header_h = 27.0
    c.setStrokeColor(MID_GRAY)
    c.setLineWidth(0.8)
    c.setFillColor(body_color)
    c.rect(x, y, width, height, fill=1, stroke=1)
    c.setFillColor(header_color)
    c.rect(x, y + height - header_h, width, header_h, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(FONT_BOLD, 10.2)
    c.drawCentredString(x + width / 2, y + height - 13.0, title)
    c.setFillColor(colors.HexColor("#EAF2FF"))
    c.setFont(FONT_REGULAR, 6.8)
    c.drawCentredString(x + width / 2, y + height - 22.2, subtitle)
    draw_paragraph(c, body, BOX_BODY, x + 7, y + height - header_h - 9, width - 14, height - header_h - 13)


def draw_arrow(c: canvas.Canvas, x1: float, y1: float, x2: float, y2: float) -> None:
    c.setStrokeColor(BLUE)
    c.setFillColor(BLUE)
    c.setLineWidth(1.2)
    c.line(x1, y1, x2, y2)
    angle = math.atan2(y2 - y1, x2 - x1)
    length = 5.0
    spread = 2.8
    base_x = x2 - length * math.cos(angle)
    base_y = y2 - length * math.sin(angle)
    perp_x = spread * math.sin(angle)
    perp_y = -spread * math.cos(angle)
    path = c.beginPath()
    path.moveTo(x2, y2)
    path.lineTo(base_x + perp_x, base_y + perp_y)
    path.lineTo(base_x - perp_x, base_y - perp_y)
    path.close()
    c.drawPath(path, fill=1, stroke=0)


def draw_flow_box(
    c: canvas.Canvas,
    *,
    x: float,
    y: float,
    width: float,
    height: float,
    number: str,
    title: str,
    body: str,
) -> None:
    c.setFillColor(WHITE)
    c.setStrokeColor(colors.HexColor("#A9BFDA"))
    c.setLineWidth(0.8)
    c.roundRect(x, y, width, height, 4, fill=1, stroke=1)
    c.setFillColor(NAVY)
    c.circle(x + 15, y + height - 15, 9, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(FONT_BOLD, 8.5)
    c.drawCentredString(x + 15, y + height - 18.1, number)
    draw_paragraph(c, title, FLOW_TITLE, x + 26, y + height - 7, width - 32, 18)
    draw_paragraph(c, body, FLOW_BODY, x + 7, y + height - 27, width - 14, height - 30)


def draw_qr(c: canvas.Canvas, url: str, x: float, y: float, size: float) -> None:
    qr = QrCodeWidget(url)
    bounds = qr.getBounds()
    qr_width = bounds[2] - bounds[0]
    qr_height = bounds[3] - bounds[1]
    drawing = Drawing(size, size, transform=[size / qr_width, 0, 0, size / qr_height, 0, 0])
    drawing.add(qr)
    renderPDF.draw(drawing, c, x, y)
    c.linkURL(url, (x, y - 10, x + size, y + size), relative=0)


def build_insert_page(path: Path) -> None:
    c = canvas.Canvas(str(path), pagesize=(PAGE_WIDTH, PAGE_HEIGHT), pageCompression=1)
    c.setTitle("AI 피드포워드 플랫폼의 교육적 설계와 활용")
    c.setAuthor("서울마포초등학교")

    left = 85.0
    content_width = 452.0

    # Subsection title, using the visual grammar of the source report.
    c.setFillColor(colors.HexColor("#E6E7E8"))
    c.rect(left, 720, 30, 27, fill=1, stroke=0)
    c.setFillColor(TEXT)
    c.setFont(FONT_BODY_BOLD, 13.5)
    c.drawCentredString(left + 15, 727.4, "나")
    c.setFont(FONT_BOLD, 16.0)
    c.drawString(left + 39, 727.0, "학생 평가 AI 피드포워드 시스템 플랫폼")
    c.setFillColor(TEAL)
    c.setFont(FONT_BOLD, 8.6)
    c.drawRightString(left + content_width, 713.2, "교육적 철학과 실제 운영")
    c.setStrokeColor(NAVY)
    c.setLineWidth(1.3)
    c.line(left, 708, left + content_width, 708)

    c.setFillColor(NAVY)
    c.rect(left, 656, content_width, 43, fill=1, stroke=0)
    key_style = paragraph_style(
        name="Key",
        font=FONT_BOLD,
        size=11.0,
        leading=16.0,
        color=WHITE,
        align=TA_CENTER,
    )
    draw_paragraph(
        c,
        "교사가 평가 기준을 설계하고 AI가 피드포워드 초안을 만든다.<br/>"
        "학생은 그 타당성을 판단해 산출물을 수정하고 성찰한다.",
        key_style,
        left + 14,
        691,
        content_width - 28,
        34,
    )

    draw_section_heading(c, "1", "교육적 철학과 역할 분담", 626)
    draw_paragraph(
        c,
        "피드포워드는 과거의 오류 점검을 넘어 다음 학습에서 실행할 수 있는 제안을 제공한다.<br/>"
        "핵심 원칙은 미래지향적·실행 가능·긍정적 톤이다.<br/>"
        "생성형 AI의 신속함을 활용하되, 부정확한 피드백 가능성을 교사 검토와 학생 판단으로 보완한다.",
        BODY,
        left + 2,
        617,
        content_width - 4,
        46,
    )

    gap = 8.0
    role_width = (content_width - gap * 2) / 3
    role_y = 485.0
    role_height = 92.0
    draw_role_box(
        c,
        x=left,
        y=role_y,
        width=role_width,
        height=role_height,
        title="교사",
        subtitle="기준과 맥락을 책임지는 설계자",
        body="성취기준·GRASPS·루브릭을<br/>설계한다. AI 초안을 확인하여<br/>수업 맥락에 맞게 고친다.",
        header_color=TEAL,
        body_color=PALE_TEAL,
    )
    draw_role_box(
        c,
        x=left + role_width + gap,
        y=role_y,
        width=role_width,
        height=role_height,
        title="AI",
        subtitle="자료를 빠르게 읽는 분석 도구",
        body="협업 과정과 산출물을 분석하고,<br/>참고 점수와 실행 가능한<br/>피드포워드 초안을 만든다.",
        header_color=BLUE,
        body_color=PALE_BLUE,
    )
    draw_role_box(
        c,
        x=left + (role_width + gap) * 2,
        y=role_y,
        width=role_width,
        height=role_height,
        title="학생",
        subtitle="근거를 들어 판단하는 학습자",
        body="루브릭과 근거로 피드백을 검토한다.<br/>반영 여부와 까닭을 기록하고<br/>수정·재평가·성찰한다.",
        header_color=NAVY,
        body_color=PALE_GRAY,
    )

    c.setFillColor(PALE_GRAY)
    c.rect(left, 458, content_width, 19, fill=1, stroke=0)
    closing_style = paragraph_style(
        name="Closing",
        font=FONT_BODY_BOLD,
        size=8.2,
        leading=10.5,
        color=TEXT,
        align=TA_CENTER,
    )
    draw_paragraph(
        c,
        "AI의 결과는 검토할 자료이며, 최종 판단과 다음 행동은 교사와 학생이 결정한다.",
        closing_style,
        left + 10,
        473,
        content_width - 20,
        14,
    )

    draw_section_heading(c, "2", "플랫폼 작동 방식", 430)
    flow_gap = 12.0
    flow_width = (content_width - flow_gap * 2) / 3
    flow_height = 54.0
    top_y = 365.0
    bottom_y = 296.0
    xs = [left, left + flow_width + flow_gap, left + (flow_width + flow_gap) * 2]

    draw_flow_box(c, x=xs[0], y=top_y, width=flow_width, height=flow_height, number="1", title="과제와 기준 설계", body="성취기준·GRASPS·루브릭")
    draw_flow_box(c, x=xs[1], y=top_y, width=flow_width, height=flow_height, number="2", title="자료 제출", body="PDF·Google 문서·시트·프레젠테이션")
    draw_flow_box(c, x=xs[2], y=top_y, width=flow_width, height=flow_height, number="3", title="AI 초안 생성", body="참고 점수·실행 가능한 제안")
    draw_flow_box(c, x=xs[2], y=bottom_y, width=flow_width, height=flow_height, number="4", title="교사 검토", body="오류 확인·수업 맥락 반영·수정")
    draw_flow_box(c, x=xs[1], y=bottom_y, width=flow_width, height=flow_height, number="5", title="학생 판단", body="반영 여부·까닭 기록·산출물 수정")
    draw_flow_box(c, x=xs[0], y=bottom_y, width=flow_width, height=flow_height, number="6", title="재평가와 성찰", body="변화 확인·다음 프로젝트로 환류")

    mid_top_y = top_y + flow_height / 2
    mid_bottom_y = bottom_y + flow_height / 2
    draw_arrow(c, xs[0] + flow_width + 2, mid_top_y, xs[1] - 2, mid_top_y)
    draw_arrow(c, xs[1] + flow_width + 2, mid_top_y, xs[2] - 2, mid_top_y)
    draw_arrow(c, xs[2] + flow_width / 2, top_y - 3, xs[2] + flow_width / 2, bottom_y + flow_height + 3)
    draw_arrow(c, xs[2] - 2, mid_bottom_y, xs[1] + flow_width + 2, mid_bottom_y)
    draw_arrow(c, xs[1] - 2, mid_bottom_y, xs[0] + flow_width + 2, mid_bottom_y)

    draw_section_heading(c, "3", "현장에서 사용하는 핵심 기능", 267)
    table_data = [
        [Paragraph("플랫폼 기능", TABLE_HEAD), Paragraph("현장 활용", TABLE_HEAD)],
        [Paragraph("다양한 산출물 평가", TABLE_LABEL), Paragraph("PDF 또는 Google 문서·시트·프레젠테이션을 교사가 정한 기준으로 분석", TABLE_CELL)],
        [Paragraph("단계형 프로젝트", TABLE_LABEL), Paragraph("여러 평가를 한 프로젝트 흐름으로 묶고, 단계마다 교사가 피드포워드를 검토", TABLE_CELL)],
        [Paragraph("다원 평가 연결", TABLE_LABEL), Paragraph("AI 평가와 자기평가·동료평가를 함께 운영하여 산출물과 협업 과정을 함께 확인", TABLE_CELL)],
        [Paragraph("교사 대시보드", TABLE_LABEL), Paragraph("과제별 평가 페이지에서 결과와 개별 피드백을 확인하고, 교사가 검토한 뒤 학생에게 전달", TABLE_CELL)],
    ]
    table = Table(table_data, colWidths=[112, content_width - 112], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DDE7F2")),
                ("TEXTCOLOR", (0, 0), (-1, -1), TEXT),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("GRID", (0, 0), (-1, -1), 0.55, colors.HexColor("#78838F")),
                ("LINEABOVE", (0, 0), (-1, 0), 1.2, TEXT),
                ("LINEBELOW", (0, -1), (-1, -1), 1.2, TEXT),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ]
        )
    )
    _, table_height = table.wrap(content_width, 132)
    table.drawOn(c, left, 258 - table_height)

    footer_y = 48.0
    footer_h = 64.0
    qr_size = 51.0
    qr_x = left + content_width - qr_size
    c.setFillColor(PALE_TEAL)
    c.setStrokeColor(colors.HexColor("#AFCBC8"))
    c.setLineWidth(0.6)
    c.rect(left, footer_y, content_width - qr_size - 10, footer_h, fill=1, stroke=1)
    c.setFillColor(TEAL)
    c.rect(left, footer_y + footer_h - 18, content_width - qr_size - 10, 18, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(FONT_BOLD, 8.8)
    c.drawString(left + 8, footer_y + footer_h - 13.0, "검증과 안전")
    draw_paragraph(
        c,
        "LLM 모델·루브릭 구성 7개 유형을 일관성·점수 편향·오차로 비교해 T3 수준 기술형을 선정했다. "
        "개인정보 보호, 데이터 처리, 학생의 AI 사용 적절성, 교육적 효과를 점검하여 "
        "학습지원 소프트웨어 심의를 진행했다.",
        BODY_TINY,
        left + 8,
        footer_y + footer_h - 23,
        content_width - qr_size - 26,
        footer_h - 27,
    )
    draw_qr(c, "https://feedforward.kr", qr_x, footer_y + 7, qr_size)
    c.setFillColor(MUTED)
    c.setFont(FONT_REGULAR, 6.4)
    c.drawCentredString(qr_x + qr_size / 2, footer_y + 0.5, "feedforward.kr")

    c.setFillColor(TEXT)
    c.setFont(FONT_BODY, 8.5)
    c.drawCentredString(PAGE_WIDTH / 2, 18.0, "8-1")

    c.showPage()
    c.save()


def insert_page(source: Path, insert_pdf: Path, output: Path) -> None:
    reader = PdfReader(source)
    insert_reader = PdfReader(insert_pdf)
    if len(reader.pages) != 34:
        raise RuntimeError(f"Unexpected source page count: {len(reader.pages)}")
    if len(insert_reader.pages) != 1:
        raise RuntimeError(f"Unexpected insert page count: {len(insert_reader.pages)}")

    source_page = reader.pages[0]
    if float(source_page.mediabox.width) != PAGE_WIDTH or float(source_page.mediabox.height) != PAGE_HEIGHT:
        raise RuntimeError(
            f"Unexpected page size: {float(source_page.mediabox.width)} x {float(source_page.mediabox.height)}"
        )

    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    writer.insert_page(insert_reader.pages[0], index=INSERT_AT_INDEX)
    writer.add_metadata(
        {
            "/Title": "2026학년도 초등 학교교육력 제고 결과보고서",
            "/Author": "서울마포초등학교",
            "/Subject": "AI 피드포워드 플랫폼 설명 페이지 포함",
            "/Creator": "Hwp 2024 및 보고서 보완 편집",
        }
    )
    with output.open("wb") as stream:
        writer.write(stream)


def main() -> None:
    register_fonts()
    source_files = list(REFERENCE_DIR.glob(REPORT_GLOB))
    if len(source_files) != 1:
        raise RuntimeError(f"Expected one source report, found {len(source_files)}")

    TMP_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    insert_pdf = TMP_DIR / "ai-feedforward-onepage.pdf"
    output_pdf = OUTPUT_DIR / OUTPUT_NAME

    build_insert_page(insert_pdf)
    insert_page(source_files[0], insert_pdf, output_pdf)

    final_reader = PdfReader(output_pdf)
    inserted_text = final_reader.pages[INSERT_AT_INDEX].extract_text() or ""
    if len(final_reader.pages) != 35:
        raise RuntimeError(f"Unexpected final page count: {len(final_reader.pages)}")
    if "교육적 철학과 실제 운영" not in inserted_text or "feedforward.kr" not in inserted_text:
        raise RuntimeError("Inserted page text verification failed")

    print(output_pdf.resolve())
    print(f"pages={len(final_reader.pages)} inserted_at={INSERT_AT_INDEX + 1}")


if __name__ == "__main__":
    main()
