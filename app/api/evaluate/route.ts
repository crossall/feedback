import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const evaluationSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    totalScore: { type: "number" },
    maxScore: { type: "number" },
    summary: { type: "string" },
    criteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          score: { type: "number" },
          maxScore: { type: "number" },
          feedback: { type: "string" },
        },
        required: ["name", "score", "maxScore", "feedback"],
        additionalProperties: false,
      },
    },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    nextStep: { type: "string" },
  },
  required: [
    "title",
    "totalScore",
    "maxScore",
    "summary",
    "criteria",
    "strengths",
    "improvements",
    "nextStep",
  ],
  additionalProperties: false,
};

function getOutputText(response: {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}) {
  if (response.output_text) return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const apiKey = String(form.get("apiKey") ?? "").trim();
    const model = String(form.get("model") ?? "gpt-5.5");
    const assignment = String(form.get("assignment") ?? "").trim();
    const rubric = String(form.get("rubric") ?? "").trim();
    const instruction = String(form.get("instruction") ?? "").trim();
    const studentGrade = String(form.get("studentGrade") ?? "").trim();
    const studentClass = String(form.get("studentClass") ?? "").trim();
    const studentName = String(form.get("studentName") ?? "").trim();
    const studentTeam = String(form.get("studentTeam") ?? "").trim();

    if (!(file instanceof File) || file.type !== "application/pdf") {
      return NextResponse.json({ error: "올바른 PDF 파일이 필요합니다." }, { status: 400 });
    }
    if (!apiKey || !assignment || !rubric) {
      return NextResponse.json({ error: "API 키, 과제 설명, 루브릭을 확인해 주세요." }, { status: 400 });
    }
    if (!studentGrade || !studentClass || !studentName || !studentTeam) {
      return NextResponse.json(
        { error: "학년, 반, 이름, 모둠을 모두 입력해 주세요." },
        { status: 400 },
      );
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF 파일은 15MB 이하여야 합니다." }, { status: 413 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const fileData = `data:application/pdf;base64,${bytes.toString("base64")}`;
    const prompt = `당신은 학생의 과학 카드뉴스를 평가하는 공정하고 따뜻한 교사입니다.

[과제]
${assignment}

[평가 루브릭]
${rubric}

[추가 지시]
${instruction}

[제출자]
학년: ${studentGrade}
반: ${studentClass}
이름: ${studentName}
모둠: ${studentTeam}

PDF의 모든 페이지에서 글, 사진, 도표, 레이아웃을 살펴보세요.
루브릭의 항목명과 배점을 그대로 최대한 유지해 항목별로 평가하세요.
총점은 각 항목 점수의 합과 일치해야 합니다.
강점과 개선점은 각각 2~4개로, PDF에서 확인한 구체적인 근거를 들어 작성하세요.
학생이 바로 실행할 수 있는 가장 중요한 다음 수정 행동을 마지막에 한 문장으로 제안하세요.`;

    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_file", filename: file.name, file_data: fileData },
              { type: "input_text", text: prompt },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "student_card_news_evaluation",
            strict: true,
            schema: evaluationSchema,
          },
        },
      }),
    });

    const responseBody = await openAIResponse.json();
    if (!openAIResponse.ok) {
      const message = responseBody?.error?.message ?? "OpenAI 평가 요청에 실패했습니다.";
      return NextResponse.json({ error: message }, { status: openAIResponse.status });
    }

    const outputText = getOutputText(responseBody);
    if (!outputText) {
      return NextResponse.json({ error: "모델이 평가 결과를 반환하지 않았습니다. 다시 시도해 주세요." }, { status: 502 });
    }

    return NextResponse.json(JSON.parse(outputText));
  } catch (error) {
    console.error("Evaluation failed:", error);
    return NextResponse.json(
      { error: "평가 결과를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
