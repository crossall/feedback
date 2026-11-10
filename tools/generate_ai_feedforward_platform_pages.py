from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
REFERENCE_DIR = ROOT / "reference"
CAPTURE_DIR = ROOT / "tmp" / "pdfs" / "platform-captures"
TMP_DIR = ROOT / "tmp" / "pdfs" / "ai-feedforward-platform-pages"
OUTPUT_DIR = ROOT / "output" / "pdf"

INSERT_OUTPUT = OUTPUT_DIR / "(마포초)AI피드포워드 플랫폼 설명페이지_8-1~8-4_20261030.pdf"
MERGED_OUTPUT = OUTPUT_DIR / "(마포초)2026학년도 초등 학교교육력 제고 결과보고서_AI피드포워드 상세설명페이지 포함_20261030.pdf"

PAGE_W = 612.0
PAGE_H = 790.0
LEFT = 80.0
CONTENT_W = 452.0
INSERT_AT = 10

FONT_DIR = Path(r"C:\Windows\Fonts")
SANS = "HanSans"
SANS_B = "HanSansBold"
SERIF = "HanBatang"
SERIF_B = "HanBatangBold"

NAVY = colors.HexColor("#25458E")
BLUE = colors.HexColor("#3569BE")
TEAL = colors.HexColor("#71BDB9")
DEEP_TEAL = colors.HexColor("#18785F")
CORAL = colors.HexColor("#DB654A")
GOLD = colors.HexColor("#D6A13B")
INK = colors.HexColor("#17212A")
MUTED = colors.HexColor("#52606C")
LINE = colors.HexColor("#D5DDE3")
PALE_BLUE = colors.HexColor("#EBF2F9")
PALE_TEAL = colors.HexColor("#EAF6F3")
PALE_CORAL = colors.HexColor("#FFF0EB")
PALE_GOLD = colors.HexColor("#FFF7E5")
PALE_GRAY = colors.HexColor("#F4F6F7")
WHITE = colors.white


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont(SANS, str(FONT_DIR / "HanSantteutDotum-Regular.TTF")))
    pdfmetrics.registerFont(TTFont(SANS_B, str(FONT_DIR / "HanSantteutDotum-Bold.TTF")))
    pdfmetrics.registerFont(TTFont(SERIF, str(FONT_DIR / "HANBatang.TTF")))
    pdfmetrics.registerFont(TTFont(SERIF_B, str(FONT_DIR / "HANBatangB.TTF")))
    pdfmetrics.registerFontFamily(SANS, normal=SANS, bold=SANS_B)
    pdfmetrics.registerFontFamily(SERIF, normal=SERIF, bold=SERIF_B)


def style(
    name: str,
    *,
    font: str = SANS,
    size: float = 8.2,
    leading: float | None = None,
    color=INK,
    align: int = TA_LEFT,
    left: float = 0,
) -> ParagraphStyle:
    return ParagraphStyle(
        name,
        fontName=font,
        fontSize=size,
        leading=leading or size * 1.38,
        textColor=color,
        alignment=align,
        leftIndent=left,
        wordWrap="CJK",
        splitLongWords=True,
    )


BODY = style("body", font=SERIF, size=8.3, leading=12.2)
BODY_S = style("body_s", font=SERIF, size=7.5, leading=10.3)
SANS_S = style("sans_s", size=7.3, leading=10.0, color=MUTED)
SANS_XS = style("sans_xs", size=6.6, leading=8.7, color=MUTED)
CARD_TITLE = style("card_title", font=SANS_B, size=9.0, leading=11.4)
CARD_BODY = style("card_body", size=7.3, leading=10.0, color=MUTED)
WHITE_HERO = style("white_hero", font=SANS_B, size=10.4, leading=14.8, color=WHITE, align=TA_CENTER)


def para(c: canvas.Canvas, text: str, st: ParagraphStyle, x: float, top: float, w: float, h: float = 1000) -> float:
    p = Paragraph(text, st)
    _, used_h = p.wrap(w, h)
    p.drawOn(c, x, top - used_h)
    return used_h


def rounded(c: canvas.Canvas, x: float, y: float, w: float, h: float, fill, stroke=LINE, radius: float = 7) -> None:
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(0.65)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def page_header(c: canvas.Canvas, kicker: str, title: str, page_no: str) -> None:
    c.setFillColor(colors.HexColor("#E8EAEC"))
    c.rect(LEFT, 722, 31, 27, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont(SERIF_B, 12.2)
    c.drawCentredString(LEFT + 15.5, 730, "Ⅲ")
    c.setFont(SANS_B, 15.0)
    c.drawString(LEFT + 40, 729, title)
    c.setFillColor(TEAL)
    c.setFont(SANS_B, 7.3)
    c.drawRightString(LEFT + CONTENT_W, 712, kicker)
    c.setStrokeColor(NAVY)
    c.setLineWidth(1.2)
    c.line(LEFT, 706, LEFT + CONTENT_W, 706)
    c.setFillColor(INK)
    c.setFont(SERIF, 8.5)
    c.drawCentredString(PAGE_W / 2, 18, page_no)


def hero(c: canvas.Canvas, text: str, y: float = 648, h: float = 48) -> None:
    c.setFillColor(NAVY)
    c.roundRect(LEFT, y, CONTENT_W, h, 6, fill=1, stroke=0)
    para(c, text, WHITE_HERO, LEFT + 16, y + h - 10, CONTENT_W - 32, h - 10)


def section_label(c: canvas.Canvas, number: str, title: str, y: float) -> None:
    c.setFillColor(BLUE)
    c.roundRect(LEFT, y, 22, 18, 3, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(SANS_B, 8.0)
    c.drawCentredString(LEFT + 11, y + 5.2, number)
    c.setFillColor(PALE_BLUE)
    c.rect(LEFT + 27, y, CONTENT_W - 27, 18, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont(SANS_B, 9.3)
    c.drawString(LEFT + 35, y + 4.8, title)


def badge(c: canvas.Canvas, x: float, y: float, text: str, fill, w: float | None = None) -> float:
    if w is None:
        w = max(38, pdfmetrics.stringWidth(text, SANS_B, 6.8) + 16)
    c.setFillColor(fill)
    c.roundRect(x, y, w, 16, 8, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(SANS_B, 6.8)
    c.drawCentredString(x + w / 2, y + 4.7, text)
    return w


def card(c: canvas.Canvas, x: float, y: float, w: float, h: float, title: str, body: str, fill=WHITE, accent=BLUE) -> None:
    rounded(c, x, y, w, h, fill)
    c.setFillColor(accent)
    c.roundRect(x + 8, y + h - 23, 18, 18, 9, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(SANS_B, 7.4)
    c.drawCentredString(x + 17, y + h - 17, title[:1])
    para(c, title, CARD_TITLE, x + 31, y + h - 8, w - 38, 18)
    para(c, body, CARD_BODY, x + 10, y + h - 31, w - 20, h - 34)


def image_reader(path: Path, crop: tuple[int, int, int, int] | None = None) -> tuple[ImageReader, int, int]:
    image = Image.open(path).convert("RGB")
    if crop is not None:
        image = image.crop(crop)
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=91, optimize=True)
    buffer.seek(0)
    return ImageReader(buffer), image.width, image.height


def draw_image_contain(
    c: canvas.Canvas,
    path: Path,
    x: float,
    y: float,
    w: float,
    h: float,
    *,
    crop: tuple[int, int, int, int] | None = None,
    fill=WHITE,
    border=LINE,
) -> None:
    rounded(c, x, y, w, h, fill, border, 6)
    reader, iw, ih = image_reader(path, crop)
    scale = min((w - 8) / iw, (h - 8) / ih)
    dw, dh = iw * scale, ih * scale
    c.drawImage(reader, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, mask="auto")


def draw_qr(c: canvas.Canvas, url: str, x: float, y: float, size: float) -> None:
    qr = QrCodeWidget(url)
    x1, y1, x2, y2 = qr.getBounds()
    drawing = Drawing(size, size, transform=[size / (x2 - x1), 0, 0, size / (y2 - y1), 0, 0])
    drawing.add(qr)
    renderPDF.draw(drawing, c, x, y)
    c.linkURL(url, (x, y, x + size, y + size), relative=0)


def draw_role_cards(c: canvas.Canvas) -> None:
    gap = 8
    w = (CONTENT_W - gap * 2) / 3
    entries = [
        ("교사", "기준·단계 설계", "6개 수행 기준을 정하고<br/>공개 단계와 최종 판단을 책임진다.", TEAL, PALE_TEAL),
        ("AI", "검토 제안 생성", "대본과 기준을 읽고 5개 의견을<br/>만들되 점수·등급은 매기지 않는다.", BLUE, PALE_BLUE),
        ("학생", "근거로 수용·기각", "O/X, 판단 근거, 이유를 남기고<br/>다음 산출물을 스스로 고친다.", NAVY, PALE_GRAY),
    ]
    for i, (title, sub, body, accent, fill) in enumerate(entries):
        x = LEFT + i * (w + gap)
        rounded(c, x, 550, w, 77, fill)
        c.setFillColor(accent)
        c.rect(x, 606, w, 21, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont(SANS_B, 9.1)
        c.drawCentredString(x + w / 2, 612.3, title)
        c.setFillColor(accent)
        c.setFont(SANS_B, 6.5)
        c.drawCentredString(x + w / 2, 594.5, sub)
        para(c, body, style(f"role{i}", size=6.9, leading=9.3, align=TA_CENTER), x + 7, 583, w - 14, 29)


def page_one(c: canvas.Canvas) -> None:
    page_header(c, "플랫폼 설계 원리와 기술 구조", "AI가 평가하는 수업이 아니라, 학생이 AI를 평가하는 수업", "8-1")
    hero(
        c,
        "교사가 기준을 설계하고, 학생이 친구·AI·실제 청중의 의견을 <b>학습 증거로 검토</b>하여<br/>다음 산출물을 고치는 과정중심평가 플랫폼이다.",
    )
    draw_role_cards(c)

    section_label(c, "1", "실제 플랫폼은 세 역할을 분리해 시작한다", 520)
    landing = CAPTURE_DIR / "project4.png"
    draw_image_contain(c, landing, LEFT, 294, 274, 211, fill=PALE_GRAY)
    c.setFillColor(MUTED)
    c.setFont(SANS, 6.2)
    c.drawString(LEFT + 5, 284, "실제 운영 화면 · /project4 · 2026.10.30 기준")

    x = LEFT + 286
    rounded(c, x, 294, 166, 211, PALE_BLUE)
    badge(c, x + 12, 476, "HOW IT IS BUILT", NAVY, 82)
    para(c, "웹앱", CARD_TITLE, x + 12, 465, 142)
    para(c, "Next.js 16 · React 19 · TypeScript", SANS_S, x + 12, 452, 142)
    c.setStrokeColor(LINE)
    for yy in (433, 391, 349):
        c.line(x + 12, yy, x + 154, yy)
    para(c, "서버 API", CARD_TITLE, x + 12, 425, 142)
    para(c, "브라우저가 저장소를 직접 읽지 않도록 분리", SANS_S, x + 12, 412, 142)
    para(c, "비공개 저장", CARD_TITLE, x + 12, 383, 142)
    para(c, "Vercel Blob(private)에 설정·기록·최종 대본 저장", SANS_S, x + 12, 370, 142)
    para(c, "역할 인증", CARD_TITLE, x + 12, 341, 142)
    para(c, "HMAC-SHA256 서명 토큰 · 8시간 만료", SANS_S, x + 12, 328, 142)

    section_label(c, "2", "판단 책임선과 안전장치", 255)
    safeguards = [
        ("점수 대신 제안", "AI는 모둠 대본과 교사 기준을 읽고 검토 의견만 만든다. 성적이나 등급을 자동 결정하지 않는다.", BLUE, PALE_BLUE),
        ("학생의 증거 판단", "AI 의견을 그대로 받지 않고 O/X·근거·까닭을 모두 기록해야 다음 수정으로 넘어간다.", TEAL, PALE_TEAL),
        ("교사의 최종 책임", "정답·해설과 전체 기록은 교사가 확인한다. 성장보고서의 수준과 문장도 교사가 최종 조정한다.", CORAL, PALE_CORAL),
    ]
    y = 191
    for title, body, accent, fill in safeguards:
        rounded(c, LEFT, y, CONTENT_W, 52, fill)
        c.setFillColor(accent)
        c.roundRect(LEFT + 10, y + 11, 80, 30, 5, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont(SANS_B, 7.4)
        c.drawCentredString(LEFT + 50, y + 22, title)
        para(c, body, SANS_S, LEFT + 100, y + 38, CONTENT_W - 112, 34)
        y -= 59
    c.setFillColor(MUTED)
    c.setFont(SANS, 5.9)
    c.drawRightString(LEFT + CONTENT_W, 48, "자료: 실제 운영 화면 및 시스템 코드 분석")
    c.showPage()


def timeline_card(c: canvas.Canvas, x: float, y: float, w: float, n: int, title: str, body: str, accent) -> None:
    rounded(c, x, y, w, 59, WHITE)
    c.setFillColor(accent)
    c.circle(x + 16, y + 43, 9, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(SANS_B, 7.2)
    c.drawCentredString(x + 16, y + 40.3, str(n))
    para(c, title, style(f"timeline-title-{n}", font=SANS_B, size=7.4, leading=9.2), x + 30, y + 51, w - 36, 18)
    para(c, body, style(f"timeline-body-{n}", size=6.2, leading=8.1, color=MUTED), x + 10, y + 28, w - 20, 24)


def page_two(c: canvas.Canvas) -> None:
    page_header(c, "과정중심평가의 실제 절차", "8단계로 움직이는 피드포워드 여정", "8-2")
    hero(c, "교사가 필요한 단계만 순차 공개하면, 학생은 <b>친구 → AI → 실제 청중</b>의 서로 다른 관점을 거쳐<br/>대본을 수정하고 설명의 효과를 다시 확인한다.")

    section_label(c, "1", "교사가 수업 흐름을 열고 닫는다", 621)
    stage_capture = CAPTURE_DIR / "project4-stage-controls.png"
    draw_image_contain(c, stage_capture, LEFT, 375, CONTENT_W, 232, crop=(0, 0, 1168, 730), fill=PALE_GRAY)
    c.setFillColor(MUTED)
    c.setFont(SANS, 6.2)
    c.drawString(LEFT + 5, 365, "실제 교사 화면 · 단계 공개와 모둠/후배 평가를 별도로 제어")

    section_label(c, "2", "6학년 학생의 8단계 여정", 338)
    items = [
        (1, "모둠 내 동료평가", "점수 없이 잘 전달된 점과 막힌 점 기록", TEAL),
        (2, "익명 의견 확인", "여러 친구가 공통으로 짚은 수정 지점 발견", TEAL),
        (3, "대표 작품 선정", "모둠 공동 선택 + 학생별 선정 이유", BLUE),
        (4, "다른 모둠 평가", "6개 기준으로 발표를 함께 살펴보기", BLUE),
        (5, "AI 의견 판단", "O/X·근거·까닭으로 수용 여부 결정", CORAL),
        (6, "최종 대본 제출", "판단 결과를 반영한 다음 산출물", CORAL),
        (7, "후배 반응 확인", "이해도·서술 의견·퀴즈 변화 확인", GOLD),
        (8, "결과·자기평가", "여러 증거를 연결해 다음 행동 성찰", NAVY),
    ]
    gap = 7
    w = (CONTENT_W - gap * 3) / 4
    for i, item in enumerate(items):
        row = 0 if i < 4 else 1
        col = i if i < 4 else i - 4
        x = LEFT + col * (w + gap)
        y = 257 if row == 0 else 191
        timeline_card(c, x, y, w, *item)

    section_label(c, "3", "한 번의 평가가 아니라 세 번의 수정 순환", 161)
    loop_data = [
        ("친구 의견", "무엇이 잘 전달되고 막혔는지 발견", "수정 지점", TEAL, PALE_TEAL),
        ("AI 의견", "측정·실험·기준으로 수용 또는 기각", "근거 판단", CORAL, PALE_CORAL),
        ("후배 반응", "실제 청중의 이해 변화로 설명 효과 확인", "다음 설명", GOLD, PALE_GOLD),
    ]
    gap = 9
    w = (CONTENT_W - gap * 2) / 3
    for i, (title, body, output, accent, fill) in enumerate(loop_data):
        x = LEFT + i * (w + gap)
        rounded(c, x, 70, w, 77, fill)
        badge(c, x + 10, 121, title, accent, 55)
        para(c, body, style(f"loop{i}", size=6.8, leading=9.0), x + 10, 112, w - 20, 31)
        c.setFillColor(accent)
        c.setFont(SANS_B, 6.5)
        c.drawRightString(x + w - 10, 78, f"→ {output}")
    c.showPage()


def feedback_mix_card(c: canvas.Canvas, x: float, y: float, w: float, n: str, title: str, body: str, accent, fill) -> None:
    rounded(c, x, y, w, 61, fill)
    c.setFillColor(accent)
    c.circle(x + 24, y + 31, 16, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(SANS_B, 11.0)
    c.drawCentredString(x + 24, y + 27.3, n)
    para(c, title, style(f"mix-title-{n}-{x}", font=SANS_B, size=7.7, leading=9.5), x + 48, y + 49, w - 56, 17)
    para(c, body, style(f"mix-body-{n}-{x}", size=6.4, leading=8.2, color=MUTED), x + 48, y + 31, w - 56, 24)


def page_three(c: canvas.Canvas) -> None:
    page_header(c, "비판적 AI 문해력의 핵심 장면", "AI의 오류까지 학습 자료로 만든다", "8-3")
    hero(c, "AI가 늘 옳다고 가르치지 않는다. <b>그럴듯한 오류가 섞인 의견</b>을 학습 증거로 검증하게 하여<br/>학생이 ‘왜 반영하고 왜 기각했는지’ 설명하도록 설계했다.")

    section_label(c, "1", "AI가 만드는 5개 피드백의 2·2·1 구성", 621)
    gap = 8
    w = (CONTENT_W - gap * 2) / 3
    feedback_mix_card(c, LEFT, 547, w, "2", "도움이 되는 의견", "실제 개선에 유효한 제안", TEAL, PALE_TEAL)
    feedback_mix_card(c, LEFT + w + gap, 547, w, "2", "과학 오류 의견", "개념적으로 틀린 제안", CORAL, PALE_CORAL)
    feedback_mix_card(c, LEFT + (w + gap) * 2, 547, w, "1", "기준 충돌 의견", "사실 오류는 아니나 강점·기준을 훼손", GOLD, PALE_GOLD)
    para(c, "각 의견에는 대본에서 찾은 근거와 관련 기준 번호를 붙인다. 정답·해설은 학생 화면에서 숨기고 교사 화면에만 둔다.", SANS_XS, LEFT + 5, 536, CONTENT_W - 10, 24)

    section_label(c, "2", "실제 학생 화면: 수용도, 기각도 근거를 남긴다", 504)
    accept = CAPTURE_DIR / "project4-ai-accept.png"
    reject = CAPTURE_DIR / "project4-ai-reject.png"

    badge(c, LEFT + 8, 467, "O 수용 사례", DEEP_TEAL, 60)
    para(c, "하루 중 태양 고도 변화만으로는 여름·겨울 비교가 어렵다는 의견을 측정 자료에 근거해 반영", SANS_S, LEFT + 76, 480, CONTENT_W - 84, 27)
    draw_image_contain(c, accept, LEFT, 343, CONTENT_W, 116, crop=(0, 0, 1082, 320), fill=PALE_TEAL, border=TEAL)

    badge(c, LEFT + 8, 306, "X 기각 사례", CORAL, 60)
    para(c, "‘태양과의 거리 변화가 계절의 원인’이라는 제안을 학습 증거와 어긋난다고 판단해 반영하지 않음", SANS_S, LEFT + 76, 319, CONTENT_W - 84, 27)
    draw_image_contain(c, reject, LEFT, 181, CONTENT_W, 116, crop=(0, 0, 1082, 320), fill=PALE_CORAL, border=CORAL)

    section_label(c, "3", "저장 전에 반드시 남기는 세 가지 기록", 151)
    records = [
        ("① O / X", "반영 또는 반영하지 않음", BLUE),
        ("② 판단 근거", "측정 자료 · 지구본 실험 · 평가 기준 · 잘 모르겠음", TEAL),
        ("③ 그렇게 정한 까닭", "선택한 증거와 판단을 자기 말로 설명", NAVY),
    ]
    gap = 8
    w = (CONTENT_W - gap * 2) / 3
    for i, (title, body, accent) in enumerate(records):
        x = LEFT + i * (w + gap)
        rounded(c, x, 70, w, 67, PALE_GRAY)
        c.setFillColor(accent)
        c.setFont(SANS_B, 7.4)
        c.drawString(x + 10, 119, title)
        para(c, body, style(f"record{i}", size=6.6, leading=8.8, color=MUTED), x + 10, 108, w - 20, 29)
    c.setFillColor(MUTED)
    c.setFont(SANS, 5.9)
    c.drawRightString(LEFT + CONTENT_W, 49, "※ 실제 화면은 학생 식별정보와 파일명을 제외하여 캡처함")
    c.showPage()


def evidence_row(c: canvas.Canvas, x: float, y: float, w: float, n: int, title: str, source: str, accent) -> None:
    c.setFillColor(WHITE)
    c.setStrokeColor(LINE)
    c.roundRect(x, y, w, 34, 5, fill=1, stroke=1)
    c.setFillColor(accent)
    c.circle(x + 15, y + 17, 9, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(SANS_B, 6.8)
    c.drawCentredString(x + 15, y + 14.3, str(n))
    c.setFillColor(INK)
    c.setFont(SANS_B, 7.0)
    c.drawString(x + 29, y + 20, title)
    c.setFillColor(MUTED)
    c.setFont(SANS, 5.9)
    c.drawString(x + 29, y + 9, source)


def page_four(c: canvas.Canvas) -> None:
    page_header(c, "증거 기반 성장보고서와 책임 있는 활용", "여러 증거를 한 사람의 성장 이야기로 연결한다", "8-4")
    hero(c, "초안 한 장이나 최종 점수만 보지 않는다. <b>수정 전·후, 영상, AI 판단, 실제 청중, 지필평가</b>를<br/>한 흐름으로 연결하고 교사가 최종적으로 수준과 피드백 문장을 조정한다.")

    section_label(c, "1", "일곱 개의 증거를 연결한 개인 성장보고서", 621)
    report = CAPTURE_DIR / "project4-growth-report-written-assessment-sample.png"
    draw_image_contain(c, report, LEFT, 331, 258, 276, crop=(60, 235, 1012, 1180), fill=PALE_GRAY)
    c.setFillColor(MUTED)
    c.setFont(SANS, 6.1)
    c.drawString(LEFT + 5, 321, "실제 성장보고서 · 학생 식별 영역을 제외한 화면")

    x = LEFT + 270
    evidence = [
        ("스크립트 초안", "최초 설명", NAVY),
        ("AI 후 수정안", "대본 변화", TEAL),
        ("개인 영상", "반복 설명", CORAL),
        ("모둠 영상", "공동 산출물", GOLD),
        ("AI 오류 판단", "근거 선택", BLUE),
        ("후배 평가", "실제 청중", DEEP_TEAL),
        ("지필평가", "개념 이해", NAVY),
    ]
    y = 573
    for i, (title, source, accent) in enumerate(evidence, 1):
        evidence_row(c, x, y, 182, i, title, source, accent)
        y -= 39

    section_label(c, "2", "자동 연결은 출발점, 최종 해석은 교사", 294)
    flow = [
        ("자료 연결", "단계별 기록을 학생별로 모음", PALE_BLUE, BLUE),
        ("확인 필요 표시", "누락·불일치 증거를 다시 확인", PALE_GOLD, GOLD),
        ("교사 검토·수정", "수준과 피드백 문장을 최종 조정", PALE_TEAL, TEAL),
        ("PDF 출력", "개인 또는 반 전체 성장보고서", PALE_CORAL, CORAL),
    ]
    gap = 7
    w = (CONTENT_W - gap * 3) / 4
    for i, (title, body, fill, accent) in enumerate(flow):
        xx = LEFT + i * (w + gap)
        rounded(c, xx, 205, w, 75, fill)
        c.setFillColor(accent)
        c.setFont(SANS_B, 7.2)
        c.drawCentredString(xx + w / 2, 259, title)
        para(c, body, style(f"flow4-{i}", size=6.2, leading=8.2, align=TA_CENTER, color=MUTED), xx + 7, 248, w - 14, 32)
        if i < 3:
            c.setFillColor(NAVY)
            c.setFont(SANS_B, 9.5)
            c.drawCentredString(xx + w + gap / 2, 237, "›")

    rounded(c, LEFT, 68, CONTENT_W, 119, PALE_TEAL, colors.HexColor("#AFCBC8"))
    badge(c, LEFT + 12, 157, "정확성과 개인정보 보호", DEEP_TEAL, 104)
    notes = [
        "AI 분석용 원본 대본 PDF는 분석 요청에 사용하고 피드백 JSON만 저장한다. 최종 제출 대본은 교사 확인을 위해 비공개 저장소에 보관한다.",
        "동료평가 작성자는 친구에게 보이지 않으며 교사는 확인한다. 업로드 전 이름·학번·연락처 등 식별정보를 제거하고 가명·식별번호를 사용한다.",
        "성장보고서는 모든 자료를 AI가 자동 판정하는 문서가 아니다. 연결된 증거를 교사가 검토하고 학생의 다음 행동을 안내하는 기록이다.",
    ]
    yy = 145
    for idx, text in enumerate(notes, 1):
        c.setFillColor(DEEP_TEAL)
        c.circle(LEFT + 18, yy - 4, 6, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont(SANS_B, 5.8)
        c.drawCentredString(LEFT + 18, yy - 6, str(idx))
        para(c, text, style(f"privacy-{idx}", size=6.4, leading=8.7), LEFT + 30, yy + 2, 336, 28)
        yy -= 29

    draw_qr(c, "https://feedforward.kr/project4", LEFT + 380, 88, 56)
    c.setFillColor(MUTED)
    c.setFont(SANS, 5.8)
    c.drawCentredString(LEFT + 408, 79, "실제 플랫폼 보기")
    c.showPage()


def build_insert(path: Path) -> None:
    required = [
        CAPTURE_DIR / "project4.png",
        CAPTURE_DIR / "project4-stage-controls.png",
        CAPTURE_DIR / "project4-ai-accept.png",
        CAPTURE_DIR / "project4-ai-reject.png",
        CAPTURE_DIR / "project4-growth-report-written-assessment-sample.png",
    ]
    missing = [str(item) for item in required if not item.exists()]
    if missing:
        raise FileNotFoundError("Missing screenshot assets:\n" + "\n".join(missing))

    c = canvas.Canvas(str(path), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
    c.setTitle("AI 피드포워드 플랫폼 설명페이지 8-1~8-4")
    c.setAuthor("서울마포초등학교")
    c.setSubject("교육력제고 결과보고서 삽입용 플랫폼 설명")
    page_one(c)
    page_two(c)
    page_three(c)
    page_four(c)
    c.save()


def merge_report(source: Path, insert_pdf: Path, output: Path) -> None:
    source_reader = PdfReader(source)
    insert_reader = PdfReader(insert_pdf)
    if len(source_reader.pages) != 34:
        raise RuntimeError(f"Unexpected source page count: {len(source_reader.pages)}")
    if len(insert_reader.pages) != 4:
        raise RuntimeError(f"Unexpected insert page count: {len(insert_reader.pages)}")

    writer = PdfWriter()
    for page in source_reader.pages[:INSERT_AT]:
        writer.add_page(page)
    for page in insert_reader.pages:
        writer.add_page(page)
    for page in source_reader.pages[INSERT_AT:]:
        writer.add_page(page)
    writer.add_metadata(
        {
            "/Title": "2026학년도 초등 학교교육력 제고 결과보고서",
            "/Author": "서울마포초등학교",
            "/Subject": "AI 피드포워드 플랫폼 상세설명페이지 포함",
            "/Creator": "서울마포초등학교 · Codex 편집",
        }
    )
    with output.open("wb") as stream:
        writer.write(stream)


def validate_pdf(path: Path, expected_pages: int, required_phrases: list[str]) -> None:
    reader = PdfReader(path)
    if len(reader.pages) != expected_pages:
        raise RuntimeError(f"{path.name}: expected {expected_pages} pages, found {len(reader.pages)}")
    for index, page in enumerate(reader.pages):
        w = float(page.mediabox.width)
        h = float(page.mediabox.height)
        if abs(w - PAGE_W) > 0.1 or abs(h - PAGE_H) > 0.1:
            raise RuntimeError(f"{path.name}: unexpected page size at {index + 1}: {w} x {h}")
    text = "\n".join((page.extract_text() or "") for page in reader.pages)
    for phrase in required_phrases:
        if phrase not in text:
            raise RuntimeError(f"{path.name}: missing expected text: {phrase}")


def main() -> None:
    register_fonts()
    sources = list(REFERENCE_DIR.glob("*20261028_1200.pdf"))
    if len(sources) != 1:
        raise RuntimeError(f"Expected one source report, found {len(sources)}")
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    build_insert(INSERT_OUTPUT)
    merge_report(sources[0], INSERT_OUTPUT, MERGED_OUTPUT)
    validate_pdf(
        INSERT_OUTPUT,
        4,
        ["학생이 AI를 평가하는 수업", "8단계로 움직이는", "AI의 오류", "성장 이야기"],
    )
    validate_pdf(
        MERGED_OUTPUT,
        38,
        ["학생이 AI를 평가하는 수업", "8단계로 움직이는", "AI의 오류", "성장 이야기"],
    )
    print(INSERT_OUTPUT.resolve())
    print(MERGED_OUTPUT.resolve())


if __name__ == "__main__":
    main()
