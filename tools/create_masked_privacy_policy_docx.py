from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor


OUTPUT = Path("Feedforward_개인정보처리방침_PDF근거_마스킹본.docx")


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_text(cell, text: str, bold: bool = False) -> None:
    cell.text = ""
    paragraph = cell.paragraphs[0]
    paragraph.paragraph_format.space_after = Pt(0)
    run = paragraph.add_run(text)
    run.bold = bold
    run.font.name = "맑은 고딕"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "맑은 고딕")
    run.font.size = Pt(9)


def style_run(run, size=10, bold=False, color="222222") -> None:
    run.font.name = "맑은 고딕"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "맑은 고딕")
    run.font.size = Pt(size)
    run.bold = bold
    run.font.color.rgb = RGBColor.from_string(color)


def add_paragraph(doc, text: str, style: str | None = None, before=0, after=6, line=1.15):
    paragraph = doc.add_paragraph(style=style)
    paragraph.paragraph_format.space_before = Pt(before)
    paragraph.paragraph_format.space_after = Pt(after)
    paragraph.paragraph_format.line_spacing = line
    run = paragraph.add_run(text)
    style_run(run)
    return paragraph


def add_bullets(doc, items: list[str]) -> None:
    for item in items:
        paragraph = doc.add_paragraph(style="List Bullet")
        paragraph.paragraph_format.space_after = Pt(3)
        paragraph.paragraph_format.line_spacing = 1.12
        run = paragraph.add_run(item)
        style_run(run)


def add_numbers(doc, items: list[str]) -> None:
    for item in items:
        paragraph = doc.add_paragraph(style="List Number")
        paragraph.paragraph_format.space_after = Pt(3)
        paragraph.paragraph_format.line_spacing = 1.12
        run = paragraph.add_run(item)
        style_run(run)


def add_heading(doc, text: str, level: int = 1) -> None:
    paragraph = doc.add_paragraph(style=f"Heading {level}")
    paragraph.paragraph_format.space_before = Pt(12 if level == 1 else 8)
    paragraph.paragraph_format.space_after = Pt(5)
    run = paragraph.add_run(text)
    style_run(run, size=14 if level == 1 else 12, bold=True, color="17352B")


def add_note(doc, text: str) -> None:
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    cell = table.cell(0, 0)
    set_cell_shading(cell, "F4F7EC")
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    paragraph = cell.paragraphs[0]
    paragraph.paragraph_format.space_before = Pt(4)
    paragraph.paragraph_format.space_after = Pt(4)
    run = paragraph.add_run(text)
    style_run(run, size=9, bold=False, color="39483F")


def add_table(doc, headers: list[str], rows: list[list[str]], widths: list[float] | None = None) -> None:
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    for index, header in enumerate(headers):
        cell = table.rows[0].cells[index]
        set_cell_shading(cell, "17352B")
        set_cell_text(cell, header, bold=True)
        for run in cell.paragraphs[0].runs:
            run.font.color.rgb = RGBColor(255, 255, 255)
        if widths:
            cell.width = Cm(widths[index])

    for row_values in rows:
        cells = table.add_row().cells
        for index, value in enumerate(row_values):
            set_cell_text(cells[index], value)
            cells[index].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
            if widths:
                cells[index].width = Cm(widths[index])

    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def build_document() -> None:
    doc = Document()
    section = doc.sections[0]
    section.top_margin = Cm(1.7)
    section.bottom_margin = Cm(1.6)
    section.left_margin = Cm(1.8)
    section.right_margin = Cm(1.8)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "맑은 고딕"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "맑은 고딕")
    normal.font.size = Pt(10)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_after = Pt(8)
    run = title.add_run("Feedforward 개인정보 처리방침")
    style_run(run, size=22, bold=True, color="17352B")

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle.paragraph_format.space_after = Pt(14)
    run = subtitle.add_run("개인정보처리방침(feedforward).pdf 근거 · 식별정보 마스킹본")
    style_run(run, size=10, color="6C746F")

    add_table(
        doc,
        ["구분", "내용"],
        [
            ["서비스명", "Feedforward"],
            ["서비스 주소", "https://feedforward.kr"],
            ["운영 형태", "교사가 학생의 AI 피드백·자기평가·동료평가를 운영하는 웹 기반 학습지원 서비스"],
            ["운영자·공급자", "전○○"],
            ["클라우드·데이터베이스", "Vercel Inc.의 클라우드 호스팅·서버리스 실행환경·관리형 데이터베이스 및 저장소"],
            ["개인정보 보호책임자", "전○○(○○초 교사)"],
            ["개인정보 문의", "h******@sen.go.kr"],
            ["전화", "010-****-****"],
            ["문서 버전", "v1.2"],
            ["공고일", "2026년 4월 15일"],
            ["시행일", "2026년 4월 15일"],
        ],
        widths=[4.0, 12.0],
    )

    add_note(
        doc,
        "본 문서는 원본 PDF의 개인정보 처리방침을 근거로 작성하되, 사람 이름·이메일·전화번호·소속학교 등 직접 식별 가능 정보는 마스킹했습니다.",
    )

    add_paragraph(
        doc,
        'Feedforward(이하 "서비스")는 「개인정보 보호법」 등 관계 법령을 준수하고, 이용자의 개인정보를 안전하고 투명하게 처리하기 위하여 다음과 같이 개인정보 처리방침을 수립·공개합니다.',
    )

    add_heading(doc, "제1조 개인정보 처리의 기본원칙과 역할 구분")
    add_numbers(doc, [
        "서비스는 수업 운영과 피드백 제공에 필요한 최소한의 정보만 처리합니다.",
        "학생의 실명·학번·개인 이메일·전화번호·주소·주민등록번호·건강정보 등 수업 피드백에 불필요한 정보는 수집하지 않습니다.",
        "별칭을 사용하더라도 교사가 실제 학생과 연결할 수 있으므로, 해당 별칭과 답안·피드백·평가기록은 개인정보로 보호합니다.",
        "학생정보를 광고, 맞춤형 마케팅, 판매, 상업적 프로파일링 또는 Feedforward 자체 AI 모델 학습에 사용하지 않습니다.",
        "학교가 정규 교육과정 운영을 위하여 서비스를 사용하는 경우 학생정보 처리의 목적·대상·기간을 결정하는 개인정보처리자는 학교이며, 운영자는 학교와 문서화된 위탁관계에서 지시받은 범위만 처리하는 수탁자입니다. 교사 계정정보와 서비스 보안정보는 운영자가 직접 처리합니다.",
        "학교가 학생정보를 처리하는 프로젝트는 학교 내부 승인, 학교운영위원회 심의, 처리 근거 확인, 학교-운영자 간 처리위탁 문서화를 마친 후 운영합니다.",
    ])

    add_heading(doc, "제2조 개인정보의 처리 목적")
    add_paragraph(doc, "서비스는 다음의 목적으로만 개인정보를 처리하며, 목적 외의 용도로 이용하지 않습니다.")
    add_numbers(doc, [
        "교사 회원의 식별·인증, 프로젝트 생성·관리 및 문의 대응",
        "학생의 프로젝트 참여와 과제·산출물 제출 지원",
        "교사가 설정한 루브릭에 따른 AI 피드백 초안 생성 및 교사 피드백 제공",
        "자기평가·동료평가·성찰 활동의 운영과 결과 확인",
        "학생별 학습과정 기록의 조회·내보내기 및 교사의 수업 개선",
        "서비스 보안, 장애 진단, 부정 접근 방지, 데이터 복구 및 권리행사 요청의 처리",
    ])
    add_paragraph(
        doc,
        "처리 목적이 변경되는 경우 관계 법령에 따른 적법한 근거를 확인하고, 필요한 경우 별도의 안내와 동의 절차를 거칩니다. 수업 운영자료를 연구·논문 또는 서비스 개선용 학습데이터로 활용하려면 수업 이용과 분리된 별도의 연구 안내와 동의를 받아야 하며, 동의하지 않아도 수업 참여에 불이익이 없도록 합니다.",
    )

    add_heading(doc, "제3조 처리하는 개인정보의 항목 및 보유기간")
    add_table(
        doc,
        ["구분", "처리 항목", "처리 목적", "보유기간"],
        [
            ["교사 계정정보", "로그인 식별자, 비밀번호 해시, 표시명", "교사 식별·인증, 프로젝트 관리, 공지·문의 대응", "탈퇴 또는 이용 종료 후 30일 이내 삭제"],
            ["설정정보", "평가 제목, 과제 설명, 루브릭, 프롬프트, 안내문구, 평가 유형, 선택한 AI 모델, 암호화된 API 키", "교사 프로젝트 운영 및 AI 피드백 생성 설정", "프로젝트 기록과 동일. 단 API 키는 기능 사용 중단 또는 삭제 요청 시 즉시 삭제"],
            ["학생 참여정보", "무작위 내부 식별자, 별칭, 프로젝트·모둠·배정정보, 참여코드, 참여상태", "프로젝트 참여, 접근권한 부여, 학습기록 연결", "교사 삭제 시 즉시. 자동 삭제 기본값은 프로젝트 종료 후 90일, 최장 마지막 활동일로부터 1년"],
            ["학습 산출물", "학생 답안·초안·수정본, 업로드 파일 및 문서 내용, 제출·수정 시각", "AI·교사 피드백 제공, 학습 과정 확인", "학생 참여정보와 동일"],
            ["평가·피드백·성찰정보", "루브릭 적용 결과, AI 피드백, 자기평가, 동료평가, 반영·부분반영·거절 여부와 이유, 교사 확인·수정 기록", "과정중심평가 및 다음 학습 행동 지원", "학생 참여정보와 동일"],
            ["자동 생성정보", "IP주소, 접속 일시, 브라우저·기기정보, 세션·오류·보안 로그", "접속 유지, 보안, 장애 분석, 부정 이용 방지", "90일. 관리자 접근기록은 1년"],
            ["문의·권리행사 기록", "요청자 구분, 연락처, 요청 내용, 처리 결과", "문의·권리행사 처리 및 분쟁 대응", "처리 완료 후 1년"],
        ],
        widths=[3.0, 5.0, 4.2, 3.6],
    )
    add_paragraph(
        doc,
        "처리 근거는 학교가 정규 교육과정 운영을 위하여 처리하는 학생정보의 경우 개인정보 보호법 제15조제1항제3호 또는 학교가 동의를 근거로 운영하기로 결정한 경우 같은 항 제1호에 따릅니다. 교사 계정정보는 계약의 체결·이행, 자동 생성정보는 서비스의 안전한 관리를 위하여 처리합니다.",
    )
    add_note(
        doc,
        "민감정보·고유식별정보 입력 금지: 서비스는 주민등록번호, 여권번호, 운전면허번호, 계좌·카드번호, 건강·상담·가족관계 등 민감한 정보를 요구하지 않습니다. 발견 시 담당 교사와 운영자는 삭제·마스킹 등 필요한 조치를 합니다.",
    )

    add_heading(doc, "제4조 개인정보의 수집 방법")
    add_bullets(doc, [
        "교사가 프로젝트를 생성하고 학생 별칭 또는 임의 코드를 등록하는 과정",
        "학생이 답안·파일·자기평가·동료평가·성찰 내용을 입력하거나 제출하는 과정",
        "AI 피드백 및 교사 피드백이 생성·저장되는 과정",
        "서비스 접속·오류·보안 관리 과정에서 자동으로 정보가 생성되는 과정",
    ])

    add_heading(doc, "제5조 만 14세 미만 아동의 개인정보 보호")
    add_numbers(doc, [
        "학생은 개인 이메일이나 소셜 계정으로 직접 회원가입하지 않고, 교사가 제공한 프로젝트 링크·참여코드와 별칭을 사용하는 방식을 원칙으로 합니다.",
        "만 14세 미만 학생의 개인정보를 동의를 근거로 처리하는 경우, 학교 또는 담당 교사는 법정대리인에게 처리 목적·항목·보유기간·AI 이용·국외 이전 등을 알리고 동의를 받아 그 여부를 확인합니다.",
        "학교가 교육업무 수행 등 다른 적법한 근거로 처리하는 경우에도 학생과 보호자에게 이해하기 쉬운 안내를 제공하고 최소한의 정보만 처리합니다.",
        "법정대리인은 학생을 대신하여 열람·정정·삭제·처리정지 및 참여 중단을 요청할 수 있습니다.",
        "AI 피드백을 원하지 않는 학생에게는 학교의 수업 운영 범위에서 교사 피드백 등 대체 방법을 제공하며, 이를 이유로 불이익을 주지 않습니다.",
    ])

    add_heading(doc, "제6조 생성형 AI 피드백과 자동화된 판단")
    add_numbers(doc, [
        "서비스는 교사가 설정한 과제 지시문·루브릭·프롬프트와 학생 답안을 바탕으로 AI 피드백 초안을 생성합니다.",
        "AI에 전송하는 정보는 과제 지시문, 루브릭·평가기준, 교사가 작성한 프롬프트, 학생이 작성한 답안 본문 및 업로드 문서의 텍스트에 한정합니다.",
        "AI에 전송하지 않는 정보는 학생의 실명, 학번, 이메일, 학교명, 학년·반·번호, 별칭, 무작위 내부 식별자, 교사 성명, 프로젝트명입니다.",
        "학생이 답안 본문에 개인적인 내용을 적을 수 있으므로, 서비스는 전송되는 답안 본문을 개인정보에 준하여 보호하며 국외 이전 사항을 공개합니다.",
        "AI 피드백에 사용하는 모델은 프로젝트를 운영하는 교사가 제9조에 공개된 제공자의 모델 중에서 선택합니다.",
        "AI 요청은 Vercel의 서버 환경 및 Vercel AI Gateway를 통해 중계되며, 입력·출력을 보관하지 않거나 최소한으로 보관하는 설정을 지원하는 제공자와 모델만 목록에 포함합니다.",
        "Feedforward는 AI 입력·출력을 자체 모델 학습이나 광고에 사용하지 않으며, AI 제공자에게도 모델 학습에 이용하지 않는 조건의 서비스를 사용합니다.",
        "AI 피드백에는 오류·환각·편향이 포함될 수 있으므로 최종 교육적 판단은 교사가 수행합니다. AI 결과만으로 학생에게 중대한 영향을 미치는 결정을 자동 확정하지 않습니다.",
        "부적절하거나 잘못된 AI 피드백에 대해서는 담당 교사 또는 개인정보 보호책임자에게 재검토·정정을 요청할 수 있습니다.",
    ])

    add_heading(doc, "제7조 동료평가와 제한적 정보 공유")
    add_numbers(doc, [
        "동료평가 기능을 사용하는 경우 학생은 교사가 배정한 산출물과 평가기준만 제한적으로 열람할 수 있습니다.",
        "평가 대상자와 평가자의 실명·학번 등 직접 식별정보는 다른 학생에게 공개하지 않으며, 화면에는 임시 표시를 사용할 수 있습니다.",
        "학생 산출물과 평가기록은 인터넷 공개 링크로 제공하거나 검색엔진에 노출하지 않습니다.",
        "개인정보, 모욕, 차별 또는 괴롭힘이 포함된 동료평가에 대해 학생은 담당 교사 또는 개인정보 보호책임자에게 숨김·정정·삭제·재평가를 요청할 수 있습니다.",
        "동료평가는 학교가 정한 수업 운영 범위에서 같은 학급 학생에게 산출물을 제한적으로 보이는 기능이며, 개인정보를 외부 제3자에게 제공하는 것이 아닙니다.",
    ])

    add_heading(doc, "제8조 개인정보의 제3자 제공")
    add_paragraph(doc, "서비스는 개인정보를 판매하거나 광고·마케팅 목적으로 제3자에게 제공하지 않습니다. 다음의 경우에만 필요한 최소 범위에서 개인정보를 제공할 수 있습니다.")
    add_bullets(doc, [
        "정보주체 또는 법정대리인이 별도로 동의한 경우",
        "법령에 특별한 규정이 있거나 수사·재판 등 법적 의무 이행을 위하여 필요한 경우",
        "생명·신체·재산의 급박한 이익을 보호하기 위하여 법령상 허용되는 경우",
    ])
    add_paragraph(doc, "외부 클라우드 및 생성형 AI 제공자가 서비스의 지시에 따라 처리하는 경우는 제3자 제공이 아니라 처리위탁에 해당합니다.")

    add_heading(doc, "제9조 개인정보 처리업무의 위탁")
    add_table(
        doc,
        ["수탁자", "위탁 업무"],
        [
            ["Vercel Inc.", "클라우드 호스팅, 서버리스 실행환경, 관리형 데이터베이스·저장소, 백업, 장애 복구, AI 요청 중계(AI Gateway)"],
            ["OpenAI, L.L.C.", "교사가 해당 제공자의 모델을 선택한 경우 AI 피드백 생성"],
            ["Anthropic PBC", "교사가 해당 제공자의 모델을 선택한 경우 AI 피드백 생성"],
            ["Google LLC", "교사가 해당 제공자의 모델을 선택한 경우 AI 피드백 생성"],
        ],
        widths=[4.4, 11.5],
    )
    add_paragraph(doc, "AI 제공자에게는 학생을 식별할 수 있는 정보를 전송하지 않으며, 전송 범위는 제6조와 같습니다. 서비스는 수탁자가 위탁 목적을 벗어나 개인정보를 이용하지 않도록 접근권한, 보유·삭제, 재위탁 및 보안조치를 관리·감독합니다.")
    add_paragraph(doc, "학교가 개인정보처리자인 경우, 운영자가 위 수탁자에게 학생정보 처리를 재위탁하는 것에 대하여 학교의 사전 동의를 받으며, 동의 사실과 재수탁자의 범위를 학교-운영자 간 개인정보 처리위탁 특약에 기재합니다.")

    add_heading(doc, "제10조 개인정보의 국외 이전")
    add_paragraph(doc, "서비스는 Vercel의 클라우드 인프라와 국외 AI 제공자의 모델을 사용하므로 개인정보가 국외에서 처리·보관될 수 있습니다.")
    add_table(
        doc,
        ["구분", "내용"],
        [
            ["이전받는 자", "Vercel Inc. / OpenAI, L.L.C. / Anthropic PBC / Google LLC"],
            ["이전 국가", "미국"],
            ["이전 항목", "(Vercel) 제3조의 전 항목 / (AI 제공자) 과제 지시문, 루브릭, 프롬프트, 학생 답안 본문 및 업로드 문서의 텍스트. 학생 실명·학번·학교명·학년·반·번호·별칭·내부 식별자는 이전하지 않음"],
            ["이전 시기·방법", "서비스 이용 시점 및 AI 피드백 요청 시점에 HTTPS/TLS로 암호화된 통신망을 통한 전송"],
            ["이전 목적", "웹서비스 제공·보관·백업·장애 복구, 교사가 선택한 모델을 통한 AI 피드백 생성"],
            ["보유·이용기간", "(Vercel) 제3조의 기간과 같음 / (AI 제공자) 입력·출력을 보관하지 않거나 제공자의 최소 보관 정책에서 정한 기간"],
            ["거부 방법·절차", "학생 또는 법정대리인은 담당 교사 또는 h******@sen.go.kr로 국외 이전의 거부를 요청할 수 있습니다. 담당 교사는 요청을 확인한 즉시 해당 학생의 AI 피드백 기능 사용을 중단합니다."],
            ["거부의 효과", "AI 피드백 기능이 제한되며, 학교의 수업 운영 범위에서 교사 피드백 등 대체 방법을 제공합니다. 거부를 이유로 수업 참여에 불이익을 주지 않습니다."],
        ],
        widths=[4.0, 12.0],
    )

    add_heading(doc, "제11조 정보주체와 법정대리인의 권리 및 행사방법")
    add_numbers(doc, [
        "정보주체와 법정대리인은 개인정보 열람, 정정·삭제, 처리정지, 동의 철회, 프로젝트 참여 중단, 데이터 내보내기 및 AI 피드백 재검토를 요청할 수 있습니다.",
        "학생에게 별도 계정이 없는 경우 담당 교사에게 요청하거나 개인정보 보호책임자 이메일로 요청할 수 있습니다.",
        "요청 이메일: h******@sen.go.kr",
        "요청자의 신원을 확인할 때에는 학교·프로젝트·학생 별칭 등 요청 대상을 확인하는 데 필요한 최소한의 정보만 요구합니다.",
        "다른 학생의 권리·안전 또는 법령상 보존의무 때문에 일부 요청이 제한되는 경우 그 사유와 이의제기 방법을 안내합니다.",
        "권리 행사를 이유로 학생에게 어떠한 불이익도 발생하지 않습니다.",
    ])

    add_heading(doc, "제12조 개인정보의 파기 절차 및 방법")
    add_numbers(doc, [
        "보유기간이 지나거나 처리 목적이 달성되면 파기대상을 확인하여 지체 없이 삭제합니다.",
        "프로젝트 삭제 시 학생 참여정보, 답안·파일, AI 피드백, 자기·동료평가, 교사 피드백, 평가배정, 캐시와 임시파일을 함께 삭제합니다.",
        "전자적 파일과 데이터베이스 기록은 복구·재생이 어렵도록 삭제하고, 출력물은 분쇄 또는 소각합니다.",
        "백업자료는 운영 데이터 삭제 후 30일 이내 순차 삭제하며, 삭제 대기기간에는 복구 목적 외로 사용하지 않습니다.",
        "삭제 후 해당 프로젝트 링크에서 자료가 조회되지 않는지 확인합니다.",
    ])

    add_heading(doc, "제13조 개인정보의 안전성 확보조치")
    add_bullets(doc, [
        "학생 실명·학번·이메일을 기본 입력항목으로 두지 않고 별칭을 사용하는 최소수집 조치",
        "HTTPS/TLS를 이용한 전송구간 암호화와 Vercel 관리형 인프라의 저장·접근 보호조치",
        "운영자·교사·학생 역할에 따른 접근권한 제한과 프로젝트별 접근 통제",
        "프로젝트 링크·참여코드에 대한 서버 측 접근권한 검사",
        "API 키와 비밀정보의 암호화 저장·환경변수 관리 및 일반 화면·로그 노출 방지",
        "AI 요청에서 학생 식별정보를 제거하고, 일반 로그에 답안·피드백 원문을 기록하지 않는 조치",
        "접속·오류·보안 로그의 점검과 비정상 접근 대응",
        "프로젝트 종료 후 삭제와 백업 순환 삭제",
        "동료평가에서 대상자·평가자 신원 비공개 및 공개 링크·검색엔진 노출 제한",
    ])
    add_paragraph(doc, "위 조치는 실제 코드·서버·계약에 구현된 범위만 공개하며, 미구현 항목은 게시 전에 보완합니다.")

    add_heading(doc, "제14조 쿠키 및 자동수집정보")
    add_numbers(doc, [
        "서비스는 로그인 상태 유지, 프로젝트 접근 및 보안을 위하여 필수 세션 쿠키를 사용할 수 있습니다.",
        "이용자는 브라우저 설정에서 쿠키를 차단할 수 있으나, 필수 쿠키를 차단하면 일부 기능이 제한될 수 있습니다.",
        "학생 대상 맞춤형 광고, 광고 추적 또는 상업적 행태정보 수집은 하지 않습니다.",
        "서비스 안정성 확인을 위한 Vercel의 기본 접속·오류 로그는 자동 생성정보 보유기간 동안 처리합니다.",
    ])

    add_heading(doc, "제15조 개인정보 보호책임자 및 열람청구 접수·처리")
    add_table(
        doc,
        ["구분", "내용"],
        [
            ["운영자·공급자", "전○○"],
            ["개인정보 보호책임자", "전○○"],
            ["전자우편", "h******@sen.go.kr"],
            ["전화", "010-****-****"],
            ["열람청구 접수·처리", "개인정보 보호책임자가 직접 접수·처리합니다. 학생과 법정대리인은 담당 교사를 통하여 접수할 수도 있으며, 담당 교사는 접수 사실을 지체 없이 보호책임자에게 전달합니다."],
        ],
        widths=[4.0, 12.0],
    )
    add_paragraph(doc, "학교가 개인정보처리자로서 서비스를 사용하는 경우 해당 학교의 개인정보 보호책임자가 학생정보에 관한 최종 책임을 지며 학교의 개인정보 처리방침이 함께 적용됩니다.")
    add_paragraph(doc, "이해충돌 관리: 서비스의 개발·운영자와 수업 담당 교사가 같은 사람인 경우, 해당 교사는 학교운영위원회의 선정 심의·의결에 참여하지 않으며 그 사실을 회의록에 기재합니다.")

    add_heading(doc, "제16조 권익침해 구제방법")
    add_paragraph(doc, "개인정보 침해로 인한 상담·신고·분쟁조정이 필요한 경우 다음 기관에 문의할 수 있습니다.")
    add_bullets(doc, [
        "개인정보침해신고센터: (국번없이) 118 / privacy.kisa.or.kr",
        "개인정보 분쟁조정위원회: 1833-6972 / kopico.go.kr",
        "대검찰청 사이버수사과: (국번없이) 1301 / spo.go.kr",
        "경찰청 사이버수사국: (국번없이) 182 / ecrm.police.go.kr",
    ])
    add_paragraph(doc, "개인정보 보호법에 따른 요구에 대하여 공공기관의 장이 한 처분 또는 부작위로 권리 또는 이익을 침해받은 사람은 행정심판을 청구할 수 있습니다.")

    add_heading(doc, "제17조 개인정보 처리방침의 변경")
    add_numbers(doc, [
        "이 처리방침은 2026년 4월 15일부터 시행합니다.",
        "처리 항목·보유기간, 외부 AI·클라우드 제공자, 국외 이전 또는 정보주체의 권리에 중요한 변경이 있는 경우 시행 7일 전부터 서비스 화면 또는 공지를 통하여 변경 내용과 시행일을 안내합니다.",
        "이 처리방침은 최초로 제정된 방침이며, 이후 개정되는 경우 변경 이력과 이전 버전을 서비스 화면에 계속 게재하여 열람할 수 있도록 합니다.",
    ])

    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = footer.add_run("Feedforward 개인정보 처리방침 | PDF 근거 마스킹본")
    style_run(run, size=8, color="777777")

    props = doc.core_properties
    props.author = ""
    props.last_modified_by = ""
    props.title = "Feedforward 개인정보 처리방침 마스킹본"
    props.subject = "PDF 근거 개인정보 처리방침"

    doc.save(OUTPUT)


if __name__ == "__main__":
    build_document()
