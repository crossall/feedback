from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
REFERENCE_ROOT = ROOT / "reference" / "AI피드백용학생작품"
DEFAULT_OUTPUT = ROOT / "lib" / "server" / "project4-growth-base.json"
DEFAULT_SUMMARY = ROOT / "output" / "project4-growth-data-summary.json"
DEFAULT_MISSING = ROOT / "output" / "project4-growth-missing-list.md"

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"m": MAIN_NS, "r": OFFICE_REL_NS, "p": PACKAGE_REL_NS, "w": WORD_NS}

CLASS_PADLETS = {
    "6-1": "https://padlet.com/hlhl1416/6-1-s023dbuw1lu19izktyor",
    "6-2": "https://padlet.com/hlhl1416/6-2-s023gog62dgqf3igato7",
    "6-3": "https://padlet.com/hlhl1416/6-3-s023gogd2j6159t454br",
    "6-4": "https://padlet.com/hlhl1416/6-4-s023goh7kasr696jwzls",
    "6-5": "https://padlet.com/hlhl1416/6-5-s023goi45fut1okh0szj",
}
GROUP_PADLET = "https://padlet.com/hlhl1416/6-s023og0tjwb54plsfrek"

AREA_TITLES = {
    "draft": ("스크립트 초안", "개인 설명 초안"),
    "revision": ("AI 피드백 후 수정안", "초안과 수정안의 변화"),
    "individualVideo": ("영상 제작 (개인)", "반별 패들렛 개인 영상"),
    "groupVideo": ("영상 제작 (모둠)", "6학년 전체 패들렛 모둠 영상"),
    "aiJudgment": ("AI 오류 피드백 수용", "AI 피드백 판단 기록"),
    "junior": ("후배 평가 반영", "5학년 후배 의견"),
    "writtenAssessment": ("지필평가", "에스덕 코스웨어 지필평가"),
}


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def integer(value: Any, default: int = 0) -> int:
    try:
        return int(float(clean(value)))
    except (TypeError, ValueError):
        return default


def cell_column(reference: str) -> int:
    letters = "".join(char for char in reference if char.isalpha()).upper()
    value = 0
    for char in letters:
        value = value * 26 + ord(char) - 64
    return value - 1


def workbook_sheets(path: Path) -> dict[str, list[list[str]]]:
    with zipfile.ZipFile(path) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared_strings = [
                "".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t"))
                for item in root.findall("m:si", NS)
            ]

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relationship_targets = {
            item.attrib["Id"]: item.attrib["Target"]
            for item in relationships.findall(f"{{{PACKAGE_REL_NS}}}Relationship")
        }
        sheets: dict[str, list[list[str]]] = {}
        for sheet in workbook.findall("m:sheets/m:sheet", NS):
            relationship_id = sheet.attrib[f"{{{OFFICE_REL_NS}}}id"]
            target = relationship_targets[relationship_id].lstrip("/")
            if not target.startswith("xl/"):
                target = f"xl/{target}"
            sheet_root = ET.fromstring(archive.read(target))
            rows: list[list[str]] = []
            for row in sheet_root.findall(".//m:sheetData/m:row", NS):
                values: dict[int, str] = {}
                for cell in row.findall("m:c", NS):
                    cell_type = cell.attrib.get("t")
                    value_node = cell.find("m:v", NS)
                    value = ""
                    if cell_type == "inlineStr":
                        value = "".join(node.text or "" for node in cell.iter(f"{{{MAIN_NS}}}t"))
                    elif value_node is not None:
                        value = value_node.text or ""
                        if cell_type == "s" and value:
                            value = shared_strings[int(value)]
                    values[cell_column(cell.attrib["r"])] = value
                if values:
                    output = [""] * (max(values) + 1)
                    for index, value in values.items():
                        output[index] = value
                    rows.append(output)
            sheets[sheet.attrib["name"]] = rows
        return sheets


def records(rows: list[list[str]]) -> list[dict[str, str]]:
    if not rows:
        return []
    headers = [clean(value) for value in rows[0]]
    output: list[dict[str, str]] = []
    for row in rows[1:]:
        record = {header: clean(row[index] if index < len(row) else "") for index, header in enumerate(headers) if header}
        if any(record.values()):
            output.append(record)
    return output


def find_reference_file(fragment: str, suffix: str) -> Path:
    matches = [path for path in REFERENCE_ROOT.glob(f"*{suffix}") if fragment in path.name]
    if len(matches) != 1:
        raise FileNotFoundError(f"Expected one {fragment!r} {suffix} file, found {len(matches)}")
    return matches[0]


def normalize_class(value: str) -> str:
    match = re.search(r"([1-9]\d*)", clean(value))
    return f"6-{match.group(1)}" if match else clean(value)


def class_number_from_path(path: Path) -> int:
    match = re.search(r"\((\d+)반_", path.name)
    if not match:
        raise ValueError(f"Cannot read class number from {path.name}")
    return int(match.group(1))


def extract_docx_text(data: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            root = ET.fromstring(archive.read("word/document.xml"))
    except (KeyError, zipfile.BadZipFile, ET.ParseError):
        return ""
    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:p", NS):
        text = "".join(node.text or "" for node in paragraph.iter(f"{{{WORD_NS}}}t"))
        text = clean(text)
        if text:
            paragraphs.append(text)
    return "\n".join(paragraphs)


def authored_script(text: str) -> str:
    markers = ["우리 모둠 대본", "모둠 대본"]
    start = -1
    for marker in markers:
        start = max(start, text.rfind(marker))
    if start >= 0:
        text = text[start:]
    text = re.sub(r"우리 모둠 대본|모둠 대본", "", text, count=1)
    return clean(text)


def scripts_from_archives(roster_groups: dict[tuple[str, str], str], final: bool) -> tuple[dict[tuple[str, str], str], dict[tuple[str, str], str]]:
    fragment = "최종본 제출" if final else "수행평가 과제"
    archives = sorted(path for path in REFERENCE_ROOT.glob("*.zip") if fragment in path.name)
    student_candidates: dict[tuple[str, str], list[str]] = defaultdict(list)
    group_candidates: dict[tuple[str, str], list[str]] = defaultdict(list)
    for archive_path in archives:
        class_name = f"6-{class_number_from_path(archive_path)}"
        with zipfile.ZipFile(archive_path) as archive:
            for entry_name in archive.namelist():
                if not entry_name.lower().endswith(".docx"):
                    continue
                file_name = PurePosixPath(entry_name).name
                student_name = clean(file_name.split(" - ", 1)[0])
                key = (class_name, student_name)
                group_name = roster_groups.get(key)
                if not group_name:
                    continue
                text = authored_script(extract_docx_text(archive.read(entry_name)))
                if len(text) < 100:
                    continue
                student_candidates[key].append(text)
                group_candidates[(class_name, group_name)].append(text)
    students = {key: max(values, key=len) for key, values in student_candidates.items()}
    groups = {key: max(values, key=len) for key, values in group_candidates.items()}
    return students, groups


def has_any(text: str, *terms: str) -> bool:
    compact = clean(text).replace(" ", "")
    return any(term.replace(" ", "") in compact for term in terms)


def concept_flags(text: str) -> dict[str, bool]:
    return {
        "axis": has_any(text, "자전축", "지구축") and has_any(text, "기울", "23.5"),
        "orbit": has_any(text, "공전", "태양 주위", "태양을 중심"),
        "altitude": has_any(text, "남중 고도", "남중고도", "태양 고도", "해가 높"),
        "energy": has_any(text, "에너지", "빛의 양", "햇빛의 양", "같은 넓이", "면적"),
        "temperature": has_any(text, "기온", "덥", "춥", "온도"),
        "hemisphere": has_any(text, "남반구", "호주") and has_any(text, "빛의 각도", "비스듬", "반대"),
        "daylight": has_any(text, "낮의 길이", "낮 길이", "낮이 길", "낮이 짧"),
        "model": has_any(text, "지구본", "전등", "그림자", "실험"),
    }


def explanation_score(text: str) -> tuple[int, dict[str, bool]]:
    flags = concept_flags(text)
    score = sum(
        [
            flags["axis"] and flags["orbit"],
            flags["altitude"],
            flags["energy"],
            flags["temperature"],
            flags["hemisphere"],
            flags["daylight"],
            flags["model"],
        ]
    )
    return score, flags


def level_for_score(score: int, upper: int, middle: int) -> str:
    if score >= upper:
        return "상"
    if score >= middle:
        return "중"
    return "하"


def strongest_phrase(flags: dict[str, bool]) -> str:
    phrases = [
        (flags["axis"] and flags["orbit"], "자전축의 기울기와 공전"),
        (flags["altitude"], "계절에 따른 남중 고도 차이"),
        (flags["energy"], "같은 넓이가 받는 태양 에너지의 양"),
        (flags["hemisphere"], "북반구와 남반구가 빛을 받는 각도 차이"),
        (flags["model"], "지구본·전등 실험"),
    ]
    selected = [phrase for present, phrase in phrases if present]
    if len(selected) >= 2:
        return f"{selected[0]}, {selected[1]}"
    return selected[0] if selected else "계절에 따른 태양 고도와 기온의 변화"


def next_concept(flags: dict[str, bool]) -> str:
    options = [
        (not (flags["axis"] and flags["orbit"]), "자전축의 기울기와 공전"),
        (not flags["altitude"], "계절별 남중 고도 차이"),
        (not flags["energy"], "같은 넓이가 받는 태양 에너지의 양"),
        (not flags["hemisphere"], "같은 순간 두 반구가 빛을 받는 각도 차이"),
        (not flags["daylight"], "낮의 길이 변화"),
    ]
    return next((phrase for missing, phrase in options if missing), "측정 자료와 실험 결과")


def area(area_id: str, feedback: str, level: str, status: str = "ready", source: str | None = None) -> dict[str, str]:
    title, default_source = AREA_TITLES[area_id]
    return {
        "id": area_id,
        "title": title,
        "source": source or default_source,
        "feedback": feedback,
        "level": level,
        "status": status,
    }


def latest_by_student(rows: list[dict[str, str]]) -> dict[tuple[str, str], dict[str, str]]:
    output: dict[tuple[str, str], dict[str, str]] = {}
    for row in rows:
        name = clean(row.get("이름"))
        class_name = normalize_class(row.get("반", ""))
        if not name or not class_name:
            continue
        key = (class_name, name)
        timestamp = float(row.get("Timestamp") or 0)
        if key not in output or timestamp >= float(output[key].get("Timestamp") or 0):
            output[key] = row
    return output


def joined_answers(row: dict[str, str] | None, starts: tuple[str, ...]) -> str:
    if not row:
        return ""
    return clean(" ".join(value for key, value in row.items() if key.startswith(starts)))


def draft_area(stage1: dict[str, str] | None, group_script: str) -> tuple[dict[str, str], dict[str, Any]]:
    text = joined_answers(stage1, ("1.", "2."))
    source = "개인 설명 초안"
    status = "ready"
    kind = "individual"
    if not text and group_script:
        text = group_script
        source = "모둠 스크립트 초안"
        status = "review"
        kind = "group"
    if not text:
        return (
            area("draft", "초안 없음", "하", "review"),
            {"kind": "missing", "score": None},
        )
    score, flags = explanation_score(text)
    level = level_for_score(score, 4, 0)
    prefix = "처음 설명에서" if kind == "individual" else "모둠 초안에서"
    feedback = (
        f"{prefix} {strongest_phrase(flags)} 등을 근거로 계절 변화를 설명했습니다. "
        "원인과 결과를 과학 용어로 연결하려는 점이 잘 드러납니다. "
        f"다음에는 {next_concept(flags)}도 더해 그 근거가 기온 변화로 이어지는 까닭을 설명해 보세요. "
        "마지막에 핵심 내용을 쉬운 말로 다시 정리하면 설명의 흐름이 더 또렷해집니다."
    )
    return area("draft", feedback, level, status, source), {"kind": kind, "score": score}


def revision_area(
    stage1: dict[str, str] | None,
    stage2: dict[str, str] | None,
    draft_script: str,
    final_script: str,
) -> tuple[dict[str, str], dict[str, Any]]:
    before = joined_answers(stage1, ("1.", "2."))
    after = joined_answers(stage2, ("3.", "4."))
    source = "개인 초안과 수정안"
    status = "ready"
    kind = "individual"
    if not after and final_script:
        before = before or draft_script
        after = final_script
        source = "모둠 초안과 최종 스크립트"
        status = "review"
        kind = "group"
    if not after:
        return (
            area("revision", "수정안 없음", "하", "review"),
            {"kind": "missing", "beforeScore": None, "afterScore": None},
        )
    before_score, before_flags = explanation_score(before)
    after_score, after_flags = explanation_score(after)
    added = [key for key, present in after_flags.items() if present and not before_flags.get(key)]
    concept_names = {
        "axis": "자전축의 기울기",
        "orbit": "공전",
        "altitude": "남중 고도",
        "energy": "태양 에너지의 양",
        "temperature": "기온",
        "hemisphere": "남반구의 계절",
        "daylight": "낮의 길이",
        "model": "실험 근거",
    }
    if added:
        additions = ", ".join(concept_names[key] for key in added[:2])
        feedback = (
            f"초안 뒤 수정안에 {additions} 내용을 보강해 원인과 결과의 연결이 더 분명해졌습니다. "
            "피드백을 바탕으로 설명을 다시 살펴보고 필요한 내용을 고친 과정이 확인됩니다. "
            f"다음에는 {next_concept(after_flags)}를 측정 자료나 실험 장면과 연결해 한 문장 더 써 보세요. "
            "수정 전후에 달라진 핵심 문장을 직접 표시하면 자신의 설명이 어떻게 좋아졌는지 더 분명히 알 수 있습니다."
        )
    elif after_score >= before_score:
        feedback = (
            f"수정안에서도 {strongest_phrase(after_flags)} 등 핵심 근거를 중심으로 설명을 유지했습니다. "
            "초안의 중요한 내용을 놓치지 않고 설명을 다시 정리한 점이 좋습니다. "
            f"다음에는 {next_concept(after_flags)}에 관한 관찰값이나 실험 결과를 구체적으로 덧붙여 보세요. "
            "근거 뒤에 '그래서 계절이 바뀐다'는 결론을 이어 쓰면 설명의 논리가 더욱 또렷해집니다."
        )
    else:
        feedback = (
            "수정안을 제출해 설명을 다시 다듬는 과정에 참여했습니다. 다만 초안에 있던 핵심 근거 일부가 수정안에서는 줄어들었습니다. "
            f"{next_concept(after_flags)}에 관한 문장을 다시 찾아 원인과 결과 사이에 넣어 보세요. "
            "고친 뒤에는 초안과 수정안을 나란히 읽으며 중요한 과학 개념이 빠지지 않았는지 확인하면 설명이 더 탄탄해집니다."
        )
    return (
        area("revision", feedback, level_for_score(after_score, 4, 0), status, source),
        {"kind": kind, "beforeScore": before_score, "afterScore": after_score},
    )


def individual_video_area(record: dict[str, str] | None) -> tuple[dict[str, str], dict[str, Any]]:
    count = integer(record.get("제출횟수") if record else 0)
    submitted = count > 0
    resubmitted = bool(record and clean(record.get("재제출")) == "예")
    note = clean(record.get("특이사항") if record else "")
    if not submitted:
        feedback = "개인 영상 없음"
        return area("individualVideo", feedback, "하", "review"), {"submitted": False, "submissionCount": 0, "resubmitted": False, "note": note}
    if resubmitted or count >= 2:
        feedback = (
            f"개인 영상을 {count}회 제출하며 첫 결과물을 스스로 다시 다듬는 과정을 보였습니다. "
            "다음 영상에서는 핵심 결론을 먼저 말한 뒤 측정 자료와 실험 근거를 차례로 이어 보세요. "
            "중요한 과학 용어 앞뒤에서 잠깐 멈추고, 한 문장을 짧게 나누어 말하면 설명이 더 또렷하게 들립니다. "
            "마지막에는 계절이 바뀌는 까닭을 한 문장으로 요약해 자신의 설명을 완성해 보세요."
        )
    else:
        feedback = (
            "반별 패들렛에 개인 영상을 제출해 자신의 과학 설명을 하나의 결과물로 완성했습니다. "
            "다음 영상에서는 핵심 결론을 먼저 말하고, 측정 자료와 지구본 실험이 그 결론을 어떻게 뒷받침하는지 차례로 이어 보세요. "
            "중요한 과학 용어는 천천히 또렷하게 말하고 문장 사이에 잠깐 멈추면 듣는 사람이 내용을 따라가기 쉽습니다. "
            "마지막에 계절 변화의 까닭을 한 문장으로 다시 정리하면 설명의 중심이 더 잘 드러납니다."
        )
    return area("individualVideo", feedback, "상", "review"), {"submitted": True, "submissionCount": count, "resubmitted": resubmitted, "note": note}


def group_video_area(record: dict[str, str] | None, has_final_script: bool) -> tuple[dict[str, str], dict[str, Any]]:
    submitted = bool(record and clean(record.get("제출")) == "제출")
    post = clean(record.get("게시물") if record else "")
    note = clean(record.get("비고") if record else "")
    if submitted:
        script_note = " 최종 스크립트까지 함께 완성했습니다." if has_final_script else ""
        feedback = (
            f"6학년 전체 패들렛에 모둠 영상을 완성해 제출했습니다.{script_note} "
            "개인이 준비한 설명을 모둠의 한 흐름으로 연결해 공동 결과물을 만든 과정이 의미 있습니다. "
            "다음 협력 활동에서는 앞사람의 설명과 다음 사람의 설명이 자연스럽게 이어지도록 연결 문장을 미리 정해 보세요. "
            "영상 끝에 모둠이 가장 중요하다고 생각한 과학적 근거를 함께 요약하면 설명의 힘이 더 커집니다."
        )
        level = "상"
    else:
        feedback = "모둠 영상 없음"
        level = "하"
    return area("groupVideo", feedback, level, "review"), {"submitted": submitted, "post": post, "note": note}


def decision_is_accept(value: str) -> bool | None:
    compact = clean(value).replace(" ", "")
    if "반영하지" in compact:
        return False
    if "반영" in compact:
        return True
    return None


def ai_judgment_area(stage34: dict[str, str] | None) -> tuple[dict[str, str], dict[str, Any]]:
    expected = [True, False, True, False, False, True, False, True]
    if stage34:
        decisions = [decision_is_accept(stage34.get(f"{symbol} 반영할까요?", "")) for symbol in ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"]]
        raw_correct = sum(value is expected[index] for index, value in enumerate(decisions))
        answered = sum(value is not None for value in decisions)
        score_adjustment = 1
        correct = min(len(expected), raw_correct + score_adjustment)
        reason_count = sum(bool(clean(stage34.get(f"{symbol} 그렇게 정한 까닭은?", ""))) for symbol in ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"])
        level = "상" if correct >= 6 and reason_count >= 4 else "중"
        feedback = (
            f"오류 문항 1개를 보정한 결과, AI 피드백 8개 중 {correct}개의 수용 여부를 과학적으로 옳게 판단했고, {reason_count}개 문항에 판단 이유를 기록했습니다. "
            "피드백을 그대로 따르지 않고 과학 개념과 비교한 점이 중요합니다. "
            "다시 볼 문항은 측정값, 지구본 실험, 자전축의 기울기 중 어떤 근거로 판단할 수 있는지 표시해 보세요. "
            "다음에는 판단 뒤에 근거와 설명의 변화를 함께 쓰면 더 설득력 있습니다."
        )
        return area("aiJudgment", feedback, level), {
            "available": True,
            "answered": answered,
            "correct": correct,
            "rawCorrect": raw_correct,
            "scoreAdjustment": score_adjustment,
            "total": 8,
            "reasonCount": reason_count,
            "essayScore": None,
        }
    return (
        area("aiJudgment", "AI 판단 응답 없음", "하", "review"),
        {"available": False, "answered": 0, "correct": None, "rawCorrect": None, "scoreAdjustment": 0, "total": 8, "reasonCount": 0, "essayScore": None},
    )


def written_assessment_area(score: int | None) -> tuple[dict[str, str], dict[str, Any]]:
    if score is None:
        return (
            area("writtenAssessment", "지필평가 기록 없음", "하", "review"),
            {"submitted": False, "score": None, "total": 20, "percentage": None},
        )
    percentage = round(score / 20 * 100)
    if score >= 16:
        level = "상"
        feedback = (
            f"에스덕 코스웨어 지필평가에서 20점 중 {score}점({percentage}%)을 기록해 핵심 개념과 자료 해석을 안정적으로 이해했습니다. "
            "맞힌 문항도 어떤 과학적 근거로 답을 골랐는지 말로 설명해 보세요. "
            "틀린 문항은 태양의 남중 고도, 받는 에너지의 양, 자전축의 기울기와 연결해 다시 판단해 보세요. "
            "이 과정을 영상 설명에 적용하면 정확한 개념을 더 쉽고 분명하게 전달할 수 있습니다."
        )
    elif score >= 10:
        level = "중"
        feedback = (
            f"에스덕 코스웨어 지필평가에서 20점 중 {score}점({percentage}%)을 기록해 계절 변화의 기본 개념을 이해했습니다. "
            "일부 문항은 관찰 결과와 계절 변화의 원인을 연결하는 연습이 더 필요합니다. "
            "틀린 문항을 남중 고도, 받는 에너지의 양, 자전축의 기울기 세 기준으로 나누어 다시 풀어 보세요. "
            "정답을 고친 뒤 까닭을 한 문장으로 설명하면 지필평가와 영상 설명에 모두 도움이 됩니다."
        )
    else:
        level = "하"
        feedback = (
            f"에스덕 코스웨어 지필평가에서 20점 중 {score}점({percentage}%)을 기록했습니다. 틀린 문항에서 헷갈린 개념을 찾는 일이 다음 성장의 시작입니다. "
            "먼저 남중 고도와 받는 에너지의 양이 기온과 어떻게 이어지는지 그림으로 정리해 보세요. "
            "그다음 자전축이 기울어진 채 공전할 때 두 반구의 계절이 왜 반대인지 말로 설명해 보세요. "
            "한 문항씩 근거를 확인하며 다시 풀면 핵심 개념을 차근차근 연결할 수 있습니다."
        )
    return (
        area("writtenAssessment", feedback, level),
        {"submitted": True, "score": score, "total": 20, "percentage": percentage},
    )


def overall_from_areas(areas: list[dict[str, str]], individual_video_submitted: bool) -> tuple[str, str, str, str, str]:
    points = {"상": 3, "중": 2, "하": 1}
    area_levels = {item["id"]: item["level"] for item in areas}
    personal_areas = ["draft", "revision", "individualVideo", "aiJudgment"]
    completed_personal_work = all(area_levels.get(area_id) != "하" for area_id in personal_areas)
    point_total = sum(points[item["level"]] for item in areas)
    if individual_video_submitted and completed_personal_work:
        overall = "상"
    elif point_total >= 10:
        overall = "중"
    else:
        overall = "하"
    if overall == "상":
        headline = "과학적 근거를 비교하고 설명을 스스로 다듬는 힘이 돋보입니다."
    elif overall == "중":
        headline = "과학적 근거를 찾아 설명을 고쳐 가는 힘이 자라고 있습니다."
    else:
        headline = "핵심 근거를 하나씩 연결하며 설명을 완성해 가고 있습니다."
    ranked = sorted(areas, key=lambda item: points[item["level"]], reverse=True)
    strength = f"{ranked[0]['title']} 과정에서 확인한 강점을 바탕으로 과학적 설명을 만들고 고쳐 가는 활동에 참여했습니다."
    next_area = sorted(areas, key=lambda item: (points[item["level"]], item["status"] != "review"))[0]
    next_step = f"다음에는 {next_area['title']}에서 확인이 필요한 근거를 다시 살펴보고, 바뀐 내용을 짧고 분명한 문장으로 설명해 보세요."
    overall_feedback = (
        "스크립트 작성, 영상 제작, AI 판단, 후배 의견과 지필평가 결과를 함께 살펴보았습니다. "
        "여러 번 설명하고 고쳐 온 과정에서 과학적 근거를 사용하는 힘이 자랐습니다. "
        "영역별 피드백을 읽고 다음 설명에서 실천할 한 가지를 골라 보세요."
    )
    return overall, headline, overall_feedback, strength, next_step


def build_reports() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    integrated_path = find_reference_file("평가통합", ".xlsx")
    ai_path = find_reference_file("AI피드백", ".xlsx")
    integrated = workbook_sheets(integrated_path)
    ai_workbook = workbook_sheets(ai_path)

    roster = records(integrated["학생별_통합"])
    roster_groups = {(row["반"], row["이름"]): row["모둠"] for row in roster}
    draft_students, draft_groups = scripts_from_archives(roster_groups, final=False)
    final_students, final_groups = scripts_from_archives(roster_groups, final=True)

    individual_videos = {(row["반"], row["이름"]): row for row in records(integrated["개인영상_학생별"])}
    group_videos = {(row["반"], row["모둠"]): row for row in records(integrated["모둠영상"])}
    written_scores = {
        (row["반"], row["이름"]): integer(row.get("점수(20점)"))
        for row in records([values[:6] for values in integrated["에스덕"]])
        if clean(row.get("점수(20점)"))
    }
    stage1 = latest_by_student(records(ai_workbook["응답_1단계"]))
    stage2 = latest_by_student(records(ai_workbook["응답_2단계"]))
    stage34 = latest_by_student(records(ai_workbook["응답_3·4단계"]))

    reports: list[dict[str, Any]] = []
    missing = Counter()
    missing_students: dict[str, list[str]] = defaultdict(list)
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    for row in roster:
        class_name = row["반"]
        student_name = row["이름"]
        group_name = row["모둠"] or "미상"
        key = (class_name, student_name)
        group_key = (class_name, group_name)

        draft, draft_evidence = draft_area(stage1.get(key), draft_groups.get(group_key, ""))
        revision, revision_evidence = revision_area(
            stage1.get(key),
            stage2.get(key),
            draft_students.get(key) or draft_groups.get(group_key, ""),
            final_students.get(key) or final_groups.get(group_key, ""),
        )
        individual_video, individual_video_evidence = individual_video_area(individual_videos.get(key))
        group_video, group_video_evidence = group_video_area(group_videos.get(group_key), bool(final_groups.get(group_key)))
        ai_judgment, ai_evidence = ai_judgment_area(stage34.get(key))
        junior = area(
            "junior",
            "후배 평가 없음",
            "중",
            "review",
        )
        written_assessment, written_assessment_evidence = written_assessment_area(written_scores.get(key))
        areas = [draft, revision, individual_video, group_video, ai_judgment, junior, written_assessment]
        overall, headline, overall_feedback, strength, next_step = overall_from_areas(
            areas,
            individual_video_evidence["submitted"],
        )
        report_key = f"{class_name}|{student_name}"
        report_id = hashlib.sha256(report_key.encode("utf-8")).hexdigest()[:20]

        evidence = {
            "draft": draft_evidence,
            "revision": revision_evidence,
            "individualVideo": {
                **individual_video_evidence,
                "padletUrl": CLASS_PADLETS.get(class_name, ""),
            },
            "groupVideo": {
                **group_video_evidence,
                "padletUrl": GROUP_PADLET,
            },
            "aiJudgment": ai_evidence,
            "junior": {"source": "pending", "responseCount": 0, "average": None},
            "writtenAssessment": written_assessment_evidence,
        }
        report = {
            "id": report_id,
            "className": class_name,
            "groupName": group_name,
            "studentName": student_name,
            "areas": areas,
            "overallLevel": overall,
            "overallHeadline": headline,
            "overallFeedback": overall_feedback,
            "strengthFeedback": strength,
            "nextStep": next_step,
            "parentPrompt": "학생의 성장 과정과 피드백을 읽어 보신 뒤, 격려하거나 함께 이야기한 내용을 적어 주세요.",
            "evidence": evidence,
            "updatedAt": now,
            "edited": False,
        }
        reports.append(report)

        checks = {
            "개인 초안 응답": draft_evidence["kind"] == "individual",
            "개인 수정안 응답": revision_evidence["kind"] == "individual",
            "개인 영상 제출": individual_video_evidence["submitted"],
            "모둠 영상 제출": group_video_evidence["submitted"],
            "AI 판단 응답": ai_evidence["available"],
            "지필평가 응시": written_assessment_evidence["submitted"],
            "모둠 배정": group_name != "미상",
        }
        for label, present in checks.items():
            if not present:
                missing[label] += 1
                missing_students[label].append(f"{class_name} {student_name}")

    reports.sort(key=lambda item: (integer(item["className"].split("-")[-1]), integer(item["groupName"]), item["studentName"]))
    summary = {
        "generatedAt": now,
        "reportCount": len(reports),
        "classCounts": dict(Counter(report["className"] for report in reports)),
        "missingCounts": dict(missing),
        "missingStudents": dict(missing_students),
        "scriptCoverage": {
            "draftGroups": len(draft_groups),
            "finalGroups": len(final_groups),
            "draftStudents": len(draft_students),
            "finalStudents": len(final_students),
        },
    }
    return reports, summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Build server-only Project 4 growth report data from the reference files.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    parser.add_argument("--missing", type=Path, default=DEFAULT_MISSING)
    args = parser.parse_args()

    reports, summary = build_reports()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.summary.parent.mkdir(parents=True, exist_ok=True)
    args.missing.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8")
    args.summary.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    missing_lines = [
        "# 프로젝트4 성장보고서 자료 확인 목록",
        "",
        f"- 생성 보고서: {summary['reportCount']}명",
        f"- 생성 시각: {summary['generatedAt']}",
        "- 아래 항목은 보고서가 생성되지 않았다는 뜻이 아니라, 자동 연결 대신 교사의 최종 확인이 필요하다는 뜻입니다.",
        "",
    ]
    for label, names in summary["missingStudents"].items():
        missing_lines.extend([
            f"## {label} ({len(names)}명)",
            "",
            ", ".join(names),
            "",
        ])
    args.missing.write_text("\n".join(missing_lines), encoding="utf-8")
    print(json.dumps({"output": str(args.output), **summary}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
