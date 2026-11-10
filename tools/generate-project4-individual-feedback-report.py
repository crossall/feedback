from __future__ import annotations

import argparse
import json
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = ROOT / "tools" / "project4-individual-feedback-report.sample.json"
DEFAULT_OUTPUT = ROOT / "output" / "pdf" / "project4-individual-feedback-report-sample.pdf"

PAGE_W, PAGE_H = A4
MARGIN_X = 14 * mm
CONTENT_W = PAGE_W - 2 * MARGIN_X

NAVY = colors.HexColor("#344457")
NAVY_DARK = colors.HexColor("#283441")
TEAL = colors.HexColor("#5A7471")
TEAL_PALE = colors.HexColor("#EEF2F1")
BLUE_PALE = colors.HexColor("#F1F3F5")
CORAL = colors.HexColor("#846B64")
GOLD = colors.HexColor("#8B7C62")
WARM_PALE = colors.HexColor("#F5F2ED")
SKY = colors.HexColor("#687887")
SAGE = colors.HexColor("#718076")
INK = colors.HexColor("#2D333A")
MUTED = colors.HexColor("#737980")
LINE = colors.HexColor("#D8DCE0")
WHITE = colors.white

AREA_COLORS = [NAVY, TEAL, CORAL, GOLD, SKY, SAGE]
AREA_PALES = [
    BLUE_PALE,
    TEAL_PALE,
    colors.HexColor("#F4F1F0"),
    WARM_PALE,
    colors.HexColor("#F1F3F4"),
    colors.HexColor("#F1F3F1"),
]


def register_fonts() -> tuple[str, str]:
    regular_candidates = [
        Path("C:/Windows/Fonts/malgun.ttf"),
        Path("C:/Windows/Fonts/NotoSansKR-Regular.ttf"),
    ]
    bold_candidates = [
        Path("C:/Windows/Fonts/malgunbd.ttf"),
        Path("C:/Windows/Fonts/NotoSansKR-Bold.ttf"),
    ]
    regular = next((path for path in regular_candidates if path.exists()), None)
    bold = next((path for path in bold_candidates if path.exists()), None)
    if not regular or not bold:
        raise FileNotFoundError("Korean fonts were not found in C:/Windows/Fonts.")
    pdfmetrics.registerFont(TTFont("GrowthRegular", str(regular)))
    pdfmetrics.registerFont(TTFont("GrowthBold", str(bold)))
    return "GrowthRegular", "GrowthBold"


def style(font: str, size: float, leading: float, color=INK, align=TA_LEFT) -> ParagraphStyle:
    return ParagraphStyle(
        name=f"style-{font}-{size}-{leading}-{align}",
        fontName=font,
        fontSize=size,
        leading=leading,
        textColor=color,
        alignment=align,
        spaceAfter=0,
        spaceBefore=0,
    )


def draw_paragraph(pdf: canvas.Canvas, text: str, paragraph_style: ParagraphStyle, x: float, top: float, width: float, max_height: float) -> float:
    block = Paragraph(escape(str(text)).replace("\n", "<br/>"), paragraph_style)
    _, height = block.wrap(width, max_height)
    block.drawOn(pdf, x, top - height)
    return height


def draw_rich_paragraph(pdf: canvas.Canvas, html: str, paragraph_style: ParagraphStyle, x: float, top: float, width: float, max_height: float) -> float:
    block = Paragraph(html, paragraph_style)
    _, height = block.wrap(width, max_height)
    block.drawOn(pdf, x, top - height)
    return height


def draw_header(pdf: canvas.Canvas, data: dict, regular: str, bold: str, page: int) -> None:
    student = data["student"]
    pdf.setFillColor(TEAL)
    pdf.setFont(bold, 7.4)
    eyebrow = data["reportEyebrow"] if page == 1 else "개인 성장 보고서 · 영역별 성장 기록"
    pdf.drawString(MARGIN_X, PAGE_H - 16 * mm, eyebrow)

    pdf.setFillColor(INK)
    pdf.setFont(bold, 20 if page == 1 else 17)
    title = data["projectTitle"] if page == 1 else "배움의 과정, 이렇게 성장했어요"
    pdf.drawString(MARGIN_X, PAGE_H - (28 if page == 1 else 27) * mm, title)

    pdf.setFont(regular, 8.5)
    pdf.setFillColor(MUTED)
    if page == 1:
        detail = f"{data['projectName']} · {data['projectPeriod']} · {data['achievementStandard']}"
        pdf.drawString(MARGIN_X, PAGE_H - 38 * mm, detail)
    else:
        pdf.drawString(MARGIN_X, PAGE_H - 37 * mm, "여섯 영역에서 확인한 강점과 다음 성장 목표")

    identity_x = PAGE_W - MARGIN_X
    if page == 2:
        badge_w = 42 * mm
        badge_h = 21 * mm
        badge_x = identity_x - badge_w
        badge_y = PAGE_H - 36 * mm
        pdf.setFillColor(BLUE_PALE)
        pdf.setStrokeColor(LINE)
        pdf.roundRect(badge_x, badge_y, badge_w, badge_h, 2.5 * mm, fill=1, stroke=1)
        pdf.setFillColor(MUTED)
        pdf.setFont(regular, 7.2)
        pdf.drawRightString(identity_x - 4 * mm, PAGE_H - 21.5 * mm, f"{student['gradeClass']} · {student['group']}")
        pdf.setFillColor(NAVY_DARK)
        pdf.setFont(bold, 12.5)
        pdf.drawRightString(identity_x - 4 * mm, PAGE_H - 30.5 * mm, student["name"])
    else:
        pdf.setFillColor(MUTED)
        pdf.setFont(regular, 8)
        pdf.drawRightString(identity_x, PAGE_H - 22 * mm, f"{student['gradeClass']} · {student['group']}")
        pdf.setFillColor(NAVY_DARK)
        pdf.setFont(bold, 15)
        pdf.drawRightString(identity_x, PAGE_H - 31 * mm, student["name"])

    line_y = PAGE_H - (43 if page == 1 else 42) * mm
    pdf.setStrokeColor(NAVY)
    pdf.setLineWidth(1.3)
    pdf.line(MARGIN_X, line_y, PAGE_W - MARGIN_X, line_y)


def draw_footer(pdf: canvas.Canvas, data: dict, regular: str, page: int, total: int) -> None:
    pdf.setStrokeColor(LINE)
    pdf.setLineWidth(0.5)
    pdf.line(MARGIN_X, 11 * mm, PAGE_W - MARGIN_X, 11 * mm)
    pdf.setFillColor(MUTED)
    pdf.setFont(regular, 6.6)
    student = data["student"]
    pdf.drawString(MARGIN_X, 6.8 * mm, f"{student['school']} 6학년 과학 · {data['teacher']}")
    pdf.drawRightString(PAGE_W - MARGIN_X, 6.8 * mm, f"{page} / {total}")


def draw_section_title(pdf: canvas.Canvas, number: int, title: str, top: float, bold: str) -> None:
    center_x = MARGIN_X + 3.2 * mm
    center_y = top - 2.8 * mm
    pdf.setFillColor(NAVY)
    pdf.circle(center_x, center_y, 3.2 * mm, fill=1, stroke=0)
    pdf.setFillColor(WHITE)
    pdf.setFont(bold, 7.4)
    pdf.drawCentredString(center_x, center_y - 1.25 * mm, str(number))
    pdf.setFillColor(NAVY_DARK)
    pdf.setFont(bold, 12)
    pdf.drawString(MARGIN_X + 8 * mm, top - 5.2 * mm, title)


def draw_level_scale(pdf: canvas.Canvas, selected: str, x: float, top: float, width: float, regular: str, bold: str, accent=TEAL) -> None:
    labels = ["상", "중", "하"]
    box_h = 6.2 * mm
    gap = 1.2 * mm
    for index, label in enumerate(labels):
        y = top - (index + 1) * box_h - index * gap
        active = label == selected
        pdf.setFillColor(accent if active else WHITE)
        pdf.setStrokeColor(accent if active else LINE)
        pdf.setLineWidth(0.7)
        pdf.roundRect(x, y, width, box_h, 1.6 * mm, fill=1, stroke=1)
        pdf.setFillColor(WHITE if active else MUTED)
        pdf.setFont(bold if active else regular, 8)
        pdf.drawCentredString(x + width / 2, y + 1.9 * mm, label)


def draw_summary(pdf: canvas.Canvas, data: dict, regular: str, bold: str) -> None:
    x = MARGIN_X
    top = PAGE_H - 49 * mm
    height = 39 * mm
    y = top - height
    pdf.setFillColor(BLUE_PALE)
    pdf.setStrokeColor(BLUE_PALE)
    pdf.roundRect(x, y, CONTENT_W, height, 4 * mm, fill=1, stroke=0)

    left_w = 37 * mm
    pdf.setStrokeColor(colors.HexColor("#D7DFE8"))
    pdf.setLineWidth(0.6)
    pdf.line(x + left_w, y + 5 * mm, x + left_w, top - 5 * mm)
    pdf.setFillColor(MUTED)
    pdf.setFont(regular, 7.2)
    pdf.drawCentredString(x + left_w / 2, top - 8 * mm, "종합 결과")
    pdf.setFillColor(NAVY)
    pdf.setFont(bold, 33)
    pdf.drawCentredString(x + left_w / 2, top - 23 * mm, data["overallLevel"])

    scale_w = 8 * mm
    scale_gap = 1.5 * mm
    scale_x = x + (left_w - (3 * scale_w + 2 * scale_gap)) / 2
    for index, label in enumerate(["상", "중", "하"]):
        active = label == data["overallLevel"]
        bx = scale_x + index * (scale_w + scale_gap)
        pdf.setFillColor(NAVY if active else WHITE)
        pdf.setStrokeColor(NAVY if active else LINE)
        pdf.roundRect(bx, y + 5 * mm, scale_w, 6 * mm, 1.2 * mm, fill=1, stroke=1)
        pdf.setFillColor(WHITE if active else MUTED)
        pdf.setFont(bold if active else regular, 6.8)
        pdf.drawCentredString(bx + scale_w / 2, y + 7 * mm, label)

    text_x = x + left_w + 6 * mm
    text_w = CONTENT_W - left_w - 12 * mm
    draw_paragraph(pdf, data["overallHeadline"], style(bold, 10.6, 14, NAVY_DARK), text_x, top - 6 * mm, text_w, 12 * mm)
    draw_paragraph(pdf, data["overallFeedback"], style(regular, 8.3, 12, INK), text_x, top - 16 * mm, text_w, 20 * mm)
    draw_paragraph(
        pdf,
        "피드백 문장은 성장의 근거를 설명하고, 상·중·하는 현재 도달 수준을 요약합니다.",
        style(regular, 6.5, 8.5, MUTED),
        text_x,
        y + 7 * mm,
        text_w,
        6 * mm,
    )


def draw_journey(pdf: canvas.Canvas, data: dict, regular: str, bold: str) -> None:
    top = PAGE_H - 104 * mm
    gap = 2 * mm
    box_w = (CONTENT_W - 5 * gap) / 6
    box_h = 25 * mm
    for index, area in enumerate(data["areas"]):
        x = MARGIN_X + index * (box_w + gap)
        accent = AREA_COLORS[index]
        pale = AREA_PALES[index]
        pdf.setFillColor(pale)
        pdf.setStrokeColor(colors.Color(accent.red, accent.green, accent.blue, alpha=0.45))
        pdf.setLineWidth(0.7)
        pdf.roundRect(x, top - box_h, box_w, box_h, 2.5 * mm, fill=1, stroke=1)
        pdf.setFillColor(accent)
        pdf.circle(x + box_w / 2, top - 5 * mm, 2.6 * mm, fill=1, stroke=0)
        pdf.setFillColor(WHITE)
        pdf.setFont(bold, 6.6)
        pdf.drawCentredString(x + box_w / 2, top - 6.1 * mm, str(index + 1))
        draw_paragraph(pdf, area["title"], style(bold, 7.2, 9, INK, TA_CENTER), x + 2 * mm, top - 10 * mm, box_w - 4 * mm, 10 * mm)
        pdf.setFillColor(accent)
        pdf.setFont(bold, 7.4)
        pdf.drawCentredString(x + box_w / 2, top - 21.8 * mm, area["level"])


def draw_area_card(pdf: canvas.Canvas, area: dict, index: int, top: float, height: float, regular: str, bold: str) -> None:
    x = MARGIN_X
    y = top - height
    accent = AREA_COLORS[index]
    pale = AREA_PALES[index]

    pdf.setFillColor(WHITE)
    pdf.setStrokeColor(LINE)
    pdf.setLineWidth(0.7)
    pdf.roundRect(x, y, CONTENT_W, height, 3.2 * mm, fill=1, stroke=1)
    pdf.setFillColor(accent)
    pdf.roundRect(x, y, 4.2 * mm, height, 3.2 * mm, fill=1, stroke=0)
    pdf.rect(x + 2.2 * mm, y, 2 * mm, height, fill=1, stroke=0)

    left_x = x + 9 * mm
    center_x = x + 57 * mm
    level_x = x + CONTENT_W - 22 * mm
    center_w = level_x - center_x - 5 * mm
    left_divider_x = center_x - 4 * mm
    left_title_x = left_x + 8 * mm
    left_title_w = left_divider_x - left_title_x - 2 * mm
    source_box_w = left_divider_x - left_x - 2 * mm

    pdf.setFillColor(accent)
    pdf.circle(left_x + 3.2 * mm, top - 8 * mm, 3.2 * mm, fill=1, stroke=0)
    pdf.setFillColor(WHITE)
    pdf.setFont(bold, 7.2)
    pdf.drawCentredString(left_x + 3.2 * mm, top - 9.2 * mm, str(index + 1))
    draw_paragraph(pdf, area["title"], style(bold, 10.2, 12.3, INK), left_title_x, top - 5.1 * mm, left_title_w, 16 * mm)
    pdf.setFillColor(pale)
    pdf.roundRect(left_x, y + 6 * mm, source_box_w, 10 * mm, 2 * mm, fill=1, stroke=0)
    draw_paragraph(pdf, "평가 자료", style(bold, 6.5, 8, accent), left_x + 3 * mm, y + 13.8 * mm, source_box_w - 6 * mm, 4 * mm)
    draw_paragraph(pdf, area["source"], style(regular, 6.8, 8.8, MUTED), left_x + 3 * mm, y + 10.5 * mm, source_box_w - 6 * mm, 7 * mm)

    pdf.setStrokeColor(LINE)
    pdf.setLineWidth(0.5)
    pdf.line(left_divider_x, y + 5 * mm, left_divider_x, top - 5 * mm)
    pdf.line(level_x - 3 * mm, y + 5 * mm, level_x - 3 * mm, top - 5 * mm)
    pdf.setFillColor(accent)
    pdf.setFont(bold, 6.8)
    pdf.drawString(center_x, top - 7 * mm, "피드백")
    feedback_top = top - 11 * mm
    draw_paragraph(pdf, area["feedback"], style(regular, 8.2, 11.6, INK), center_x, feedback_top, center_w, height - 19 * mm)

    draw_level_scale(pdf, area["level"], level_x, top - 6 * mm, 17 * mm, regular, bold, accent)


def draw_growth_summary(pdf: canvas.Canvas, data: dict, regular: str, bold: str) -> None:
    top = 99 * mm
    gap = 4 * mm
    card_w = (CONTENT_W - gap) / 2
    card_h = 28.5 * mm
    cards = [
        ("선생님이 본 잘한 점", data["strengthFeedback"], TEAL, TEAL_PALE),
        ("다음 단계", data["nextStep"], NAVY, BLUE_PALE),
    ]
    for index, (title, body, accent, pale) in enumerate(cards):
        x = MARGIN_X + index * (card_w + gap)
        y = top - card_h
        pdf.setFillColor(WHITE)
        pdf.setStrokeColor(LINE)
        pdf.roundRect(x, y, card_w, card_h, 3 * mm, fill=1, stroke=1)
        pdf.setFillColor(accent)
        pdf.roundRect(x, y, 2.6 * mm, card_h, 2.5 * mm, fill=1, stroke=0)
        pdf.rect(x + 1.2 * mm, y, 1.4 * mm, card_h, fill=1, stroke=0)
        pdf.setFillColor(pale)
        pdf.roundRect(x + 7 * mm, top - 11 * mm, card_w - 14 * mm, 7 * mm, 1.5 * mm, fill=1, stroke=0)
        draw_paragraph(pdf, title, style(bold, 9.2, 11, accent), x + 10 * mm, top - 5.6 * mm, card_w - 20 * mm, 7 * mm)
        draw_paragraph(pdf, body, style(regular, 7.8, 11.2, INK), x + 8 * mm, top - 14 * mm, card_w - 16 * mm, 15 * mm)


def draw_parent_box(pdf: canvas.Canvas, data: dict, regular: str, bold: str) -> None:
    x = MARGIN_X
    top = 55 * mm
    height = 37 * mm
    y = top - height
    left_w = 130 * mm
    pdf.setFillColor(WHITE)
    pdf.setStrokeColor(GOLD)
    pdf.setLineWidth(0.8)
    pdf.roundRect(x, y, CONTENT_W, height, 3 * mm, fill=1, stroke=1)
    pdf.setFillColor(WARM_PALE)
    pdf.roundRect(x, y, CONTENT_W, height, 3 * mm, fill=1, stroke=0)
    pdf.setStrokeColor(GOLD)
    pdf.line(x + left_w, y, x + left_w, top)

    draw_paragraph(pdf, "학부모 의견", style(bold, 9.3, 11, NAVY_DARK), x + 5 * mm, top - 5 * mm, left_w - 10 * mm, 7 * mm)
    draw_paragraph(pdf, data["parentPrompt"], style(regular, 7.1, 9.5, MUTED), x + 5 * mm, top - 11 * mm, left_w - 10 * mm, 8 * mm)
    pdf.setStrokeColor(colors.HexColor("#B8B2A4"))
    pdf.setLineWidth(0.45)
    for offset in [21, 28, 35]:
        line_y = top - offset * mm
        pdf.line(x + 5 * mm, line_y, x + left_w - 5 * mm, line_y)

    right_x = x + left_w + 5 * mm
    draw_paragraph(pdf, "확인 및 서명", style(bold, 8.5, 10, NAVY_DARK), right_x, top - 6 * mm, CONTENT_W - left_w - 10 * mm, 6 * mm)
    draw_paragraph(pdf, "20     년      월      일", style(regular, 7.2, 9, MUTED), right_x, top - 16 * mm, CONTENT_W - left_w - 10 * mm, 6 * mm)
    draw_paragraph(pdf, "보호자                 (서명)", style(regular, 7.2, 9, MUTED), right_x, top - 27 * mm, CONTENT_W - left_w - 10 * mm, 6 * mm)


def validate_data(data: dict) -> None:
    if len(data.get("areas", [])) != 6:
        raise ValueError("The report requires exactly six evaluation areas.")
    if data.get("overallLevel") not in {"상", "중", "하"}:
        raise ValueError("overallLevel must be one of 상, 중, 하.")
    for area in data["areas"]:
        if area.get("level") not in {"상", "중", "하"}:
            raise ValueError(f"Invalid level for {area.get('title', 'unknown')}: {area.get('level')}")


def build_report(data_path: Path, output_path: Path) -> Path:
    with data_path.open("r", encoding="utf-8") as stream:
        data = json.load(stream)
    validate_data(data)
    regular, bold = register_fonts()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    pdf = canvas.Canvas(str(output_path), pagesize=A4, pageCompression=1)
    pdf.setTitle(data["reportTitle"])
    pdf.setAuthor("Feedforward")
    pdf.setSubject("Project 4 individual qualitative feedback report")

    draw_header(pdf, data, regular, bold, 1)
    draw_summary(pdf, data, regular, bold)
    draw_section_title(pdf, 1, "나의 배움 여정", PAGE_H - 92 * mm, bold)
    draw_journey(pdf, data, regular, bold)
    draw_section_title(pdf, 2, "영역별 성장 기록 · 1", PAGE_H - 132 * mm, bold)
    draw_area_card(pdf, data["areas"][0], 0, PAGE_H - 144 * mm, 38 * mm, regular, bold)
    draw_area_card(pdf, data["areas"][1], 1, PAGE_H - 186 * mm, 38 * mm, regular, bold)
    draw_area_card(pdf, data["areas"][2], 2, PAGE_H - 228 * mm, 38 * mm, regular, bold)
    draw_footer(pdf, data, regular, 1, 2)
    pdf.showPage()

    draw_header(pdf, data, regular, bold, 2)
    draw_section_title(pdf, 2, "영역별 성장 기록 · 2", PAGE_H - 50 * mm, bold)
    draw_area_card(pdf, data["areas"][3], 3, PAGE_H - 61 * mm, 38 * mm, regular, bold)
    draw_area_card(pdf, data["areas"][4], 4, PAGE_H - 103 * mm, 38 * mm, regular, bold)
    draw_area_card(pdf, data["areas"][5], 5, PAGE_H - 145 * mm, 38 * mm, regular, bold)
    draw_section_title(pdf, 3, "성장 정리", 108 * mm, bold)
    draw_growth_summary(pdf, data, regular, bold)
    draw_section_title(pdf, 4, "가정에서 함께 읽어 주세요", 64 * mm, bold)
    draw_parent_box(pdf, data, regular, bold)
    draw_footer(pdf, data, regular, 2, 2)
    pdf.save()
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a two-page Project 4 individual feedback report PDF.")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    path = build_report(args.data.resolve(), args.output.resolve())
    print(path)


if __name__ == "__main__":
    main()
