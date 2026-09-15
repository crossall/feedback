import { NextResponse } from "next/server";
import { readProject4Token } from "@/lib/server/project4-auth";
import {
  getProject4AiReview,
  getProject4Config,
  saveProject4AiReview,
} from "@/lib/server/project4-store";
import { getTeacherApiKeys } from "@/lib/server/teacher-store";
import type { Project4AiFeedback, Project4AiReview } from "@/lib/project4";

export const runtime = "nodejs";
export const maxDuration = 120;

type GeneratedFeedback = {
  title?: unknown;
  feedback?: unknown;
  evidence?: unknown;
  criterionNumbers?: unknown;
  isValid?: unknown;
  teacherExplanation?: unknown;
};

function cleanText(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function studentView(value: Project4AiReview): Project4AiReview {
  return {
    ...value,
    submittedById: "",
    submittedByName: "",
    feedbacks: value.feedbacks.map((item) => ({
      id: item.id,
      title: item.title,
      feedback: item.feedback,
      evidence: item.evidence,
      criterionNumbers: item.criterionNumbers,
      accept: item.accept,
      basis: item.basis,
      reason: item.reason,
    })),
  };
}

function parseFeedbacks(raw: string): GeneratedFeedback[] {
  const cleaned = raw.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI 피드백 형식을 읽지 못했습니다.");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { feedbacks?: GeneratedFeedback[] };
  if (!Array.isArray(parsed.feedbacks) || parsed.feedbacks.length !== 5) {
    throw new Error("AI 피드백 5개를 만들지 못했습니다. 다시 요청해 주세요.");
  }
  return parsed.feedbacks;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { token?: string; fileName?: string; pdfData?: string };
    const access = readProject4Token(body.token || "", "student");
    const config = await getProject4Config();
    if (config.openStage < 5) {
      return NextResponse.json({ error: "5단계는 아직 교사가 열지 않았습니다." }, { status: 400 });
    }

    const group = config.groups.find((item) => item.id === access.groupId && item.classId === access.classId);
    const student = group?.students.find((item) => item.id === access.studentId);
    if (!group || !student) {
      return NextResponse.json({ error: "학생 정보를 다시 확인해 주세요." }, { status: 400 });
    }

    const rawPdfData = String(body.pdfData || "");
    if (rawPdfData.length > 4_100_000) {
      return NextResponse.json({ error: "PDF는 3MB 이하여야 합니다." }, { status: 413 });
    }
    const pdfData = rawPdfData.replace(/^data:application\/pdf;base64,/, "");
    if (!pdfData) {
      return NextResponse.json({ error: "모둠 스크립트 PDF를 선택해 주세요." }, { status: 400 });
    }

    const apiKeys = await getTeacherApiKeys("4523");
    const apiKey = process.env.PROJECT4_ANTHROPIC_API_KEY?.trim() || apiKeys.anthropic;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Claude API 키가 없습니다. 교사 보관함에 Claude API 키를 저장해 주세요." },
        { status: 400 },
      );
    }

    const criteriaText = config.criteria.map((item, index) => `${index + 1}. ${item}`).join("\n");
    const prompt = `당신은 초등학교 6학년 과학 수업에서 AI 피드백을 비판적으로 검토하는 활동지를 만드는 조력자입니다.

[프로젝트]
${config.title}
${config.description}

[평가 기준]
${criteriaText}

첨부한 PDF는 한 모둠이 작성한 '계절이 바뀌는 까닭' 설명 스크립트입니다.
학생들이 AI를 무조건 믿지 않고 O/X와 근거를 판단하도록, 그럴듯한 AI 피드백을 정확히 5개 만드세요.

구성 규칙:
- 5개 중 정확히 2개는 스크립트를 실제로 개선하는 타당한 피드백이어야 합니다.
- 정확히 2개는 과학 개념이 틀린 피드백이어야 합니다.
- 정확히 1개는 과학적으로 틀리지는 않지만 평가 기준과 충돌하거나 스크립트의 좋은 강점을 없애는 피드백이어야 합니다.
- 학생이 문장만 보고 정답을 바로 눈치채지 않도록 모두 자연스럽고 구체적으로 씁니다.
- 피드백에는 점수나 등급을 넣지 않습니다.
- 근거는 스크립트의 실제 표현을 짧게 인용하거나 정확하게 요약합니다.
- 계절 변화의 주된 원인은 지구가 자전축이 기울어진 채 태양 주위를 공전하는 것이며, 지구와 태양 사이의 거리 변화가 아닙니다.
- 자전은 낮과 밤, 공전과 자전축 기울기는 계절 변화와 관련됩니다.
- 남반구도 햇빛을 받으며, 북반구와 같은 시기에 태양 고도와 에너지 수광 조건이 반대입니다.
- isValid와 teacherExplanation은 교사에게만 표시됩니다.

설명 없이 아래 JSON 형식만 출력하세요.
{
  "feedbacks": [
    {
      "title": "짧은 제목",
      "feedback": "학생에게 보여 줄 구체적인 AI 피드백",
      "evidence": "스크립트에서 확인한 근거",
      "criterionNumbers": [1, 3],
      "isValid": true,
      "teacherExplanation": "교사용 정답 및 해설"
    }
  ]
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfData },
            },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "Claude 요청에 실패했습니다." },
        { status: response.status },
      );
    }

    const raw = (data.content || [])
      .filter((item: { type?: string; text?: string }) => item.type === "text" && item.text)
      .map((item: { text: string }) => item.text)
      .join("\n");
    const generated = parseFeedbacks(raw);
    if (generated.filter((item) => item.isValid === true).length !== 2) {
      throw new Error("AI 피드백의 검토 구성을 확인하지 못했습니다. 다시 요청해 주세요.");
    }

    const feedbacks: Project4AiFeedback[] = generated.map((item, index) => ({
      id: `feedback-${index + 1}`,
      title: cleanText(item.title, 150) || `AI 피드백 ${index + 1}`,
      feedback: cleanText(item.feedback),
      evidence: cleanText(item.evidence),
      criterionNumbers: Array.isArray(item.criterionNumbers)
        ? item.criterionNumbers.map(Number).filter((number) => Number.isInteger(number) && number >= 1 && number <= 6).slice(0, 6)
        : [],
      isValid: item.isValid === true,
      teacherExplanation: cleanText(item.teacherExplanation),
    }));
    if (feedbacks.some((item) => !item.feedback || !item.evidence || !item.teacherExplanation)) {
      throw new Error("AI 피드백 내용이 완전하지 않습니다. 다시 요청해 주세요.");
    }

    const classId = access.classId || "";
    const groupId = access.groupId || "";
    const existing = await getProject4AiReview(classId, groupId);
    const now = new Date().toISOString();
    const review: Project4AiReview = {
      classId,
      groupId,
      fileName: cleanText(body.fileName, 300) || "모둠-스크립트.pdf",
      revision: (existing?.revision || 0) + 1,
      feedbacks,
      wrongFeedback: "",
      submittedById: access.studentId || "",
      submittedByName: student.name,
      generatedAt: now,
      updatedAt: now,
    };
    await saveProject4AiReview(review);

    return NextResponse.json({ review: studentView(review) });
  } catch (error) {
    console.error("Project4 Claude request failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "모둠 AI 피드백을 만들지 못했습니다." },
      { status: 400 },
    );
  }
}
