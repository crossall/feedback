import { NextResponse } from "next/server";
import { readProject4Token } from "@/lib/server/project4-auth";
import { getProject4Config } from "@/lib/server/project4-store";
import { getTeacherApiKeys } from "@/lib/server/teacher-store";

export const runtime = "nodejs";
export const maxDuration = 120;

const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 4,
  user_location: {
    type: "approximate",
    country: "KR",
    timezone: "Asia/Seoul",
  },
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      token?: string;
      fileName?: string;
      pdfData?: string;
    };
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

    const pdfData = String(body.pdfData || "").replace(/^data:application\/pdf;base64,/, "");
    if (!pdfData) {
      return NextResponse.json({ error: "모둠 대본 PDF를 선택해 주세요." }, { status: 400 });
    }
    if (pdfData.length > 18_000_000) {
      return NextResponse.json({ error: "PDF는 12MB 이하여야 합니다." }, { status: 413 });
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
    const prompt = `당신은 초등학교 6학년 과학 프로젝트의 피드백 조력자입니다.

[프로젝트]
${config.title}
${config.description}

[학생이 만든 평가 기준]
${criteriaText}

첨부한 PDF는 5학년 후배에게 '계절이 바뀌는 까닭'을 설명할 영상 대본입니다.
점수나 등급을 매기지 말고, 대본을 더 정확하고 이해하기 쉽게 고칠 수 있는 피드백을 정확히 5개 작성하세요.

반드시 확인할 과학 내용:
- 계절 변화의 주된 원인은 지구와 태양 사이 거리 변화가 아니라, 지구 자전축이 기울어진 채 태양 주위를 공전하기 때문입니다.
- 계절에 따라 태양의 남중 고도, 낮의 길이, 일정한 면적이 받는 태양 에너지가 달라지는 관계를 정확히 확인하세요.
- 북반구와 남반구의 계절이 반대인 까닭을 확인하세요.
- 학생의 측정 자료나 지구본·전등 실험에 PDF에서 확인되지 않는 내용을 지어내지 마세요.
- 확실하지 않은 사실은 신뢰할 수 있는 자료로 확인하고, 학생이 이해할 수 있는 쉬운 말로 설명하세요.

각 피드백에는 제목, 고칠 내용, PDF에서 찾은 근거, 관련 평가 기준 번호를 포함하세요.
응답은 설명 없이 다음 JSON 형식만 사용하세요.
{
  "feedbacks": [
    {
      "id": "feedback-1",
      "title": "짧은 제목",
      "feedback": "구체적인 수정 제안",
      "evidence": "대본에서 확인한 근거",
      "criterionNumbers": [1, 3]
    }
  ]
}`;

    const payload = {
      model: "claude-opus-4-8",
      max_tokens: 4096,
      tools: [WEB_SEARCH_TOOL],
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfData,
            },
          },
          { type: "text", text: prompt },
        ],
      }],
    };

    let response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    let data = await response.json();
    if (!response.ok && data?.error?.type === "invalid_request_error") {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...payload, tools: undefined }),
      });
      data = await response.json();
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "Claude 요청에 실패했습니다." },
        { status: response.status },
      );
    }

    const raw = (data.content || [])
      .filter((item: { type?: string; text?: string }) => item.type === "text" && item.text)
      .map((item: { text: string }) => item.text)
      .join("\n")
      .replace(/```json|```/gi, "")
      .trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const parsed = start >= 0 && end > start ? JSON.parse(raw.slice(start, end + 1)) : null;
    if (!Array.isArray(parsed?.feedbacks) || parsed.feedbacks.length !== 5) {
      return NextResponse.json({ error: "AI 피드백 형식을 확인하지 못했습니다. 다시 시도해 주세요." }, { status: 502 });
    }
    return NextResponse.json({ feedbacks: parsed.feedbacks });
  } catch (error) {
    console.error("Project4 Claude request failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI 피드백을 만들지 못했습니다." },
      { status: 400 },
    );
  }
}
