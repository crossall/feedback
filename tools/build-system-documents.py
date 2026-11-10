from __future__ import annotations

import re
from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs" / "system"
OUTPUT = ROOT / "artifacts" / "system-docs"

FONT = "Malgun Gothic"
MONO_FONT = "Consolas"
INK = "17352B"
MUTED = "5D6B63"
GREEN = "2D7254"
PALE_GREEN = "E9F2EC"
PALE_BLUE = "EAF1F6"
LIGHT_GRAY = "F4F5F3"
BORDER = "D9D9D9"
WHITE = "FFFFFF"


def set_run_font(run, name=FONT, size=None, bold=None, color=None):
    run.font.name = name
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:hAnsi"), name)
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), name)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


def set_style_font(style, name=FONT, size=None, bold=None, color=INK):
    style.font.name = name
    style._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:ascii"), name)
    style._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:hAnsi"), name)
    style._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), name)
    if size is not None:
        style.font.size = Pt(size)
    if bold is not None:
        style.font.bold = bold
    style.font.color.rgb = RGBColor.from_string(color)


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=110, start=120, bottom=110, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_borders(table):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        element = borders.find(qn(f"w:{edge}"))
        if element is None:
            element = OxmlElement(f"w:{edge}")
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), "5")
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), BORDER)


def mark_repeat_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    header = OxmlElement("w:tblHeader")
    header.set(qn("w:val"), "true")
    tr_pr.append(header)


def mark_cant_split(row):
    tr_pr = row._tr.get_or_add_trPr()
    cant_split = OxmlElement("w:cantSplit")
    cant_split.set(qn("w:val"), "true")
    tr_pr.append(cant_split)


def set_keep_with_next(paragraph, value=True):
    paragraph.paragraph_format.keep_with_next = value


def set_keep_together(paragraph, value=True):
    paragraph.paragraph_format.keep_together = value


def add_page_number(paragraph):
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = paragraph.add_run()
    set_run_font(run, size=9, color=MUTED)
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    text = OxmlElement("w:t")
    text.text = "1"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.extend([begin, instr, separate, text, end])


def configure_document(doc: Document, title: str, subject: str):
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.orientation = WD_ORIENT.PORTRAIT
    section.top_margin = Inches(0.72)
    section.bottom_margin = Inches(0.68)
    section.left_margin = Inches(0.78)
    section.right_margin = Inches(0.78)

    normal = doc.styles["Normal"]
    set_style_font(normal, size=10.8, color="28332D")
    normal.paragraph_format.space_after = Pt(7)
    normal.paragraph_format.line_spacing = 1.32
    normal.paragraph_format.widow_control = True

    title_style = doc.styles["Title"]
    set_style_font(title_style, size=28, bold=True, color="000000")
    title_style.paragraph_format.space_after = Pt(12)
    title_style.paragraph_format.line_spacing = 1.05
    title_p_pr = title_style._element.get_or_add_pPr()
    title_border = title_p_pr.find(qn("w:pBdr"))
    if title_border is not None:
        title_p_pr.remove(title_border)

    heading_specs = {
        "Heading 1": (19, 20, 8),
        "Heading 2": (15, 16, 6),
        "Heading 3": (12.5, 12, 4),
    }
    for style_name, (size, before, after) in heading_specs.items():
        style = doc.styles[style_name]
        set_style_font(style, size=size, bold=True, color="000000")
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True
        style.paragraph_format.keep_together = True

    for style_name in ("List Bullet", "List Number"):
        style = doc.styles[style_name]
        set_style_font(style, size=10.8, color="28332D")
        style.paragraph_format.space_after = Pt(4)
        style.paragraph_format.line_spacing = 1.25

    caption = doc.styles["Caption"]
    set_style_font(caption, size=9.2, bold=False, color=MUTED)
    caption.paragraph_format.space_before = Pt(5)
    caption.paragraph_format.space_after = Pt(12)

    doc.core_properties.title = title
    doc.core_properties.subject = subject
    doc.core_properties.author = "Feedforward"
    doc.core_properties.keywords = "Feedforward, 시스템, 평가, AI, 파이프라인, 아키텍처"

    footer = section.footer.paragraphs[0]
    add_page_number(footer)


def add_cover(doc: Document, title: str, subtitle: str, summary: str, edition: str):
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(64)

    eyebrow = doc.add_paragraph()
    eyebrow.paragraph_format.space_after = Pt(14)
    run = eyebrow.add_run("FEEDFORWARD SYSTEM DOCUMENT")
    set_run_font(run, size=10, bold=True, color=GREEN)
    run.font.letter_spacing = Pt(1.2) if hasattr(run.font, "letter_spacing") else None

    heading = doc.add_paragraph(style="Title")
    heading.add_run(title)

    sub = doc.add_paragraph()
    sub.paragraph_format.space_after = Pt(26)
    sub.paragraph_format.line_spacing = 1.2
    run = sub.add_run(subtitle)
    set_run_font(run, size=15, bold=False, color=MUTED)

    abstract = doc.add_paragraph()
    abstract.paragraph_format.space_after = Pt(32)
    abstract.paragraph_format.line_spacing = 1.45
    run = abstract.add_run(summary)
    set_run_font(run, size=11.5, color="28332D")

    meta = doc.add_paragraph()
    meta.paragraph_format.space_before = Pt(70)
    for label, value in (("문서 기준일", "2026년 11월 3일"), ("문서 구분", edition), ("대상 독자", "교사, 학교 운영자, 개발 운영자")):
        line = meta.add_run(f"{label}  ")
        set_run_font(line, size=9.8, bold=True, color=INK)
        line = meta.add_run(value + "\n")
        set_run_font(line, size=9.8, color=MUTED)

    doc.add_page_break()


INLINE_PATTERN = re.compile(r"(\*\*.+?\*\*|`.+?`|\[[^\]]+\]\([^\)]+\))")


def add_inline(paragraph, text):
    position = 0
    for match in INLINE_PATTERN.finditer(text):
        if match.start() > position:
            run = paragraph.add_run(text[position:match.start()])
            set_run_font(run)
        token = match.group(0)
        if token.startswith("**"):
            run = paragraph.add_run(token[2:-2])
            set_run_font(run, bold=True)
        elif token.startswith("`"):
            run = paragraph.add_run(token[1:-1])
            set_run_font(run, name=MONO_FONT, size=9.5, color=INK)
        else:
            label = token[1:token.index("]")]
            run = paragraph.add_run(label)
            set_run_font(run, color=GREEN)
            run.underline = True
        position = match.end()
    if position < len(text):
        run = paragraph.add_run(text[position:])
        set_run_font(run)


def clean_heading(text):
    return re.sub(r"^\d+(?:\.\d+)*\s+", "", text).strip()


def add_table(doc: Document, rows):
    if not rows:
        return
    columns = len(rows[0])
    table = doc.add_table(rows=1, cols=columns)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_borders(table)
    widths_by_count = {
        2: [0.31, 0.69],
        3: [0.20, 0.34, 0.46],
        4: [0.15, 0.18, 0.31, 0.36],
        5: [0.13, 0.13, 0.17, 0.19, 0.38],
    }
    proportions = widths_by_count.get(columns, [1 / columns] * columns)
    usable = 6.88

    header = table.rows[0]
    mark_repeat_header(header)
    mark_cant_split(header)
    for index, value in enumerate(rows[0]):
        cell = header.cells[index]
        cell.width = Inches(usable * proportions[index])
        set_cell_shading(cell, INK)
        set_cell_margins(cell, top=120, bottom=120)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        paragraph = cell.paragraphs[0]
        paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
        paragraph.paragraph_format.space_after = Pt(0)
        paragraph.paragraph_format.line_spacing = 1.1
        run = paragraph.add_run(value.strip())
        set_run_font(run, size=9.2, bold=True, color=WHITE)

    for row_index, values in enumerate(rows[1:], start=1):
        row = table.add_row()
        mark_cant_split(row)
        for index, value in enumerate(values):
            cell = row.cells[index]
            cell.width = Inches(usable * proportions[index])
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if row_index % 2 == 0:
                set_cell_shading(cell, row_index % 4 == 0 and PALE_BLUE or LIGHT_GRAY)
            paragraph = cell.paragraphs[0]
            paragraph.paragraph_format.space_after = Pt(0)
            paragraph.paragraph_format.line_spacing = 1.18
            add_inline(paragraph, value.strip())
            for run in paragraph.runs:
                if run.font.name != MONO_FONT:
                    set_run_font(run, size=8.8)

    after = doc.add_paragraph()
    after.paragraph_format.space_after = Pt(2)


def set_image_alt_text(inline_shape, title, description):
    doc_pr = inline_shape._inline.docPr
    doc_pr.set("name", title)
    doc_pr.set("descr", description)


def add_figure(doc: Document, image_path: Path, alt_text: str):
    paragraph = doc.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_before = Pt(8)
    paragraph.paragraph_format.space_after = Pt(3)
    run = paragraph.add_run()
    inline = run.add_picture(str(image_path), width=Inches(6.82))
    set_image_alt_text(inline, alt_text, alt_text)
    caption = doc.add_paragraph(f"그림  {alt_text}", style="Caption")
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_keep_with_next(caption, False)


def add_code_block(doc: Document, lines):
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.left_indent = Inches(0.28)
    paragraph.paragraph_format.right_indent = Inches(0.12)
    paragraph.paragraph_format.space_before = Pt(4)
    paragraph.paragraph_format.space_after = Pt(10)
    paragraph.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    set_keep_together(paragraph, True)
    for index, line in enumerate(lines):
        run = paragraph.add_run(line + ("\n" if index < len(lines) - 1 else ""))
        set_run_font(run, name=MONO_FONT, size=8.8, color="314139")


def parse_markdown(doc: Document, source_path: Path, first_file=True, appendix_title=None):
    lines = source_path.read_text(encoding="utf-8").splitlines()
    if not first_file:
        doc.add_page_break()
        heading = doc.add_paragraph(style="Heading 1")
        heading.add_run(appendix_title or clean_heading(lines[0].lstrip("# ")))

    index = 0
    paragraph_buffer = []
    in_code = False
    code_lines = []

    def flush_paragraph():
        nonlocal paragraph_buffer
        if paragraph_buffer:
            text = " ".join(item.strip() for item in paragraph_buffer).strip()
            if text:
                paragraph = doc.add_paragraph()
                add_inline(paragraph, text)
            paragraph_buffer = []

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        if stripped.startswith("```"):
            flush_paragraph()
            if in_code:
                add_code_block(doc, code_lines)
                code_lines = []
                in_code = False
            else:
                in_code = True
            index += 1
            continue
        if in_code:
            code_lines.append(line)
            index += 1
            continue

        if not stripped:
            flush_paragraph()
            index += 1
            continue

        image_match = re.fullmatch(r"!\[([^\]]*)\]\(([^\)]+)\)", stripped)
        if image_match:
            flush_paragraph()
            image_path = (source_path.parent / image_match.group(2)).resolve()
            if image_path.suffix.lower() == ".svg":
                image_path = image_path.with_suffix(".png")
            add_figure(doc, image_path, image_match.group(1) or image_path.stem)
            index += 1
            continue

        if stripped.startswith("|") and index + 1 < len(lines) and re.match(r"^\|?\s*:?-+", lines[index + 1].strip()):
            flush_paragraph()
            table_lines = [stripped]
            index += 2
            while index < len(lines) and lines[index].strip().startswith("|"):
                table_lines.append(lines[index].strip())
                index += 1
            rows = [[cell.strip() for cell in row.strip("|").split("|")] for row in table_lines]
            add_table(doc, rows)
            continue

        heading_match = re.match(r"^(#{1,4})\s+(.+)$", stripped)
        if heading_match:
            flush_paragraph()
            level = len(heading_match.group(1))
            text = clean_heading(heading_match.group(2))
            if level == 1:
                if first_file:
                    index += 1
                    continue
                level = 2
            style = f"Heading {min(max(level - 1, 1), 3)}"
            paragraph = doc.add_paragraph(style=style)
            paragraph.add_run(text)
            index += 1
            continue

        bullet_match = re.match(r"^[-*]\s+(.+)$", stripped)
        numbered_match = re.match(r"^(\d+)\.\s+(.+)$", stripped)
        if bullet_match or numbered_match:
            flush_paragraph()
            if bullet_match:
                paragraph = doc.add_paragraph(style="List Bullet")
                add_inline(paragraph, bullet_match.group(1))
            else:
                # Word's built-in List Number continues numbering across separate
                # Markdown lists. Preserve the source number explicitly so every
                # independent list restarts exactly as authored.
                paragraph = doc.add_paragraph(style="List Paragraph")
                paragraph.paragraph_format.left_indent = Inches(0.32)
                paragraph.paragraph_format.first_line_indent = Inches(-0.22)
                paragraph.paragraph_format.space_after = Pt(1)
                paragraph.paragraph_format.line_spacing = 1.12
                paragraph.add_run(f"{numbered_match.group(1)}.  ")
                add_inline(paragraph, numbered_match.group(2))
            index += 1
            continue

        paragraph_buffer.append(stripped)
        index += 1

    flush_paragraph()
    if code_lines:
        add_code_block(doc, code_lines)


def add_contents(doc: Document, entries):
    heading = doc.add_paragraph("문서 구성", style="Heading 1")
    set_keep_with_next(heading)
    for entry in entries:
        paragraph = doc.add_paragraph(style="List Bullet")
        run = paragraph.add_run(entry)
        set_run_font(run, size=11)
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(12)


def build_document(filename, title, subtitle, summary, edition, sources, contents):
    doc = Document()
    configure_document(doc, title, subtitle)
    add_cover(doc, title, subtitle, summary, edition)
    add_contents(doc, contents)
    for index, source in enumerate(sources):
        if isinstance(source, tuple):
            source_path, appendix_title = source
        else:
            source_path, appendix_title = source, None
        parse_markdown(
            doc,
            DOCS / source_path,
            first_file=index == 0,
            appendix_title=appendix_title,
        )

    for section in doc.sections:
        section.page_width = Inches(8.5)
        section.page_height = Inches(11)
        section.orientation = WD_ORIENT.PORTRAIT
        section.top_margin = Inches(0.72)
        section.bottom_margin = Inches(0.68)
        section.left_margin = Inches(0.78)
        section.right_margin = Inches(0.78)
        if not section.footer.paragraphs[0].text:
            add_page_number(section.footer.paragraphs[0])

    output_path = OUTPUT / filename
    doc.save(output_path)
    return output_path


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    outputs = [
        build_document(
            "Feedforward_시스템_파이프라인.docx",
            "Feedforward 시스템 파이프라인",
            "교사 설계부터 학생 수행과 다음 수업까지의 운영 흐름",
            "이 문서는 Feedforward의 공통 8단계 파이프라인과 일반 AI 평가, 동료평가, 통합 세션, 계절의 비밀 프로젝트, 프로젝트 워크스페이스의 분기 흐름을 정의합니다. 각 단계의 책임, 입력, 완료 조건, 실패 처리, 운영 지표, 코드 품질 게이트를 한 문서에서 확인할 수 있습니다.",
            "운영 파이프라인 상세 설계",
            ["01-system-pipeline.md"],
            [
                "공통 평가 파이프라인",
                "기능별 분기와 계절의 비밀 8단계",
                "데이터 생명주기와 실패 처리",
                "운영 지표와 코드 품질 파이프라인",
                "역할별 책임 분담",
            ],
        ),
        build_document(
            "Feedforward_시스템_구조와_실행로드맵.docx",
            "Feedforward 시스템 구조와 실행 로드맵",
            "역할과 데이터 경계 그리고 단계별 개선 계획",
            "이 문서는 Feedforward의 화면, 공개 API, 도메인 규칙, 비공개 저장소, 외부 AI와 Google 서비스 사이의 구조를 설명합니다. 현재 보안 경계와 알려진 차이를 숨기지 않고 기록하며, 개인정보 정합성, 교사 인증, 자동 파기, 공통 모듈, 테스트 체계를 순서대로 보완하는 실행 계획을 제공합니다.",
            "시스템 구조 및 개선 계획",
            [
                "02-system-architecture.md",
                ("04-implementation-roadmap.md", "시스템 실행 로드맵"),
                ("generated-api-inventory.md", "자동 API 인벤토리"),
            ],
            [
                "시스템 경계와 계층 구조",
                "데이터 저장과 외부 AI 흐름",
                "인증과 권한 그리고 배포 구조",
                "알려진 위험과 목표 구조",
                "우선순위별 실행 로드맵",
                "실제 Route Handler 자동 인벤토리",
            ],
        ),
        build_document(
            "Feedforward_시스템_철학.docx",
            "Feedforward 시스템 철학",
            "평가와 AI와 학생 주도성에 관한 제품 판단 원칙",
            "이 문서는 Feedforward가 평가를 다음 행동으로 연결하는 방식, 교사와 학생과 AI의 책임, 여러 관점의 평가, 설명 가능성, 개인정보 최소화, 프로젝트별 경험과 공통 안전장치의 관계를 정의합니다. 현재 구현이 원칙과 어긋나는 부분도 함께 밝혀 앞으로의 제품 결정을 검증할 수 있게 합니다.",
            "제품 및 교육 설계 원칙",
            ["03-system-philosophy.md"],
            [
                "평가의 끝과 다음 행동",
                "기준과 AI의 역할",
                "학생 주도성과 다면 평가",
                "설명 가능성과 개인정보 보호",
                "교사 중심 운영과 공통 안전장치",
                "비목표와 제품 결정 질문",
            ],
        ),
    ]
    for output in outputs:
        print(output)


if __name__ == "__main__":
    main()
