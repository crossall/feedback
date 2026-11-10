import { NextResponse } from "next/server";
import type { ClassConfig } from "@/lib/class-config";
import { fetchGoogleDocText } from "@/lib/google-docs";
import { EvaluationRequestError, requestEvaluation } from "@/lib/llm-evaluation";
import { decryptSessionClassConfig } from "@/lib/session-token";
import { getTeacherApiKeys } from "@/lib/server/teacher-store";
import { saveSessionResponse } from "@/lib/server/session-store";
import type { SessionAiStep } from "@/lib/evaluation-session";

export const runtime = "nodejs";
export const maxDuration = 120;

function buildPrompt(input: {
  config: ClassConfig;
  studentGrade: string;
  studentClass: string;
  studentName: string;
  studentTeam: string;
  documentText?: string;
}) {
  return `당신은 학생의 학습 결과물을 평가하는 공정하고 따뜻한 교사입니다.

[과제]
${input.config.assignment}

[평가 루브릭]
${input.config.rubric}

[추가 지침]
${input.config.instruction}

[제출자]
학년: ${input.studentGrade}
반: ${input.studentClass}
이름: ${input.studentName}
모둠: ${input.studentTeam || "개인 제출"}

${input.documentText ? `[학생이 제출한 글]\n${input.documentText}\n` : ""}
루브릭의 항목명과 배점을 최대한 유지해서 항목별로 평가하세요.
총점은 항목 점수 합계와 일치해야 합니다.
강점과 개선점은 각각 2~4개로, 제출물에서 확인할 수 있는 근거를 들어 작성하세요.
학생이 바로 실행할 수 있는 다음 수정 행동을 마지막에 한 문장으로 제안하세요.`;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const sessionToken = String(form.get("sessionToken") ?? "").trim();
    const stepId = String(form.get("stepId") ?? "").trim();
    const studentGrade = String(form.get("studentGrade") ?? "").trim();
    const studentClass = String(form.get("studentClass") ?? "").trim();
    const studentName = String(form.get("studentName") ?? "").trim();
    const studentTeam = String(form.get("studentTeam") ?? "").trim();

    if (!sessionToken || !stepId) {
      return NextResponse.json({ error: "세션 평가 정보를 확인해 주세요." }, { status: 400 });
    }
    if (!studentGrade || !studentClass || !studentName) {
      return NextResponse.json(
        { error: "학년, 반, 이름을 모두 입력해 주세요." },
        { status: 400 },
      );
    }

    const sessionConfig = decryptSessionClassConfig(sessionToken);
    const step = sessionConfig.steps.find(({ id }) => id === stepId);
    if (!step || (step.kind !== "pdf" && step.kind !== "docs")) {
      return NextResponse.json({ error: "AI 평가 단계를 찾을 수 없습니다." }, { status: 400 });
    }
    const aiStep = step as SessionAiStep;
    let classConfig: ClassConfig = aiStep.config;
    const teacherApiKeys = await getTeacherApiKeys(sessionConfig.teacherId ?? "");
    classConfig = {
      ...classConfig,
      teacherId: sessionConfig.teacherId,
      apiKey: "",
      apiKeys: {
        openai: teacherApiKeys.openai,
        anthropic: teacherApiKeys.anthropic,
      },
    };

    let sourceLabel = "";
    let documentText = "";
    let pdf: { filename: string; base64: string } | undefined;

    if (aiStep.kind === "pdf") {
      const file = form.get("file");
      if (!(file instanceof File) || file.type !== "application/pdf") {
        return NextResponse.json({ error: "PDF 파일이 필요합니다." }, { status: 400 });
      }
      if (file.size > 15 * 1024 * 1024) {
        return NextResponse.json({ error: "PDF 파일은 15MB 이하여야 합니다." }, { status: 413 });
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      sourceLabel = file.name;
      pdf = {
        filename: file.name,
        base64: bytes.toString("base64"),
      };
    } else {
      const documentUrl = String(form.get("documentUrl") ?? "").trim();
      if (!documentUrl) {
        return NextResponse.json({ error: "Google Docs 주소를 입력해 주세요." }, { status: 400 });
      }
      sourceLabel = documentUrl;
      documentText = await fetchGoogleDocText(documentUrl);
    }

    const evaluation = await requestEvaluation({
      config: classConfig,
      prompt: buildPrompt({
        config: classConfig,
        studentGrade,
        studentClass,
        studentName,
        studentTeam,
        documentText,
      }),
      pdf,
      schemaName: "session_ai_evaluation",
    });
    const saved = await saveSessionResponse({
      config: sessionConfig,
      stepId,
      respondent: {
        grade: studentGrade,
        className: studentClass,
        name: studentName,
        team: studentTeam,
      },
      payload: {
        type: "ai",
        inputKind: aiStep.kind,
        sourceLabel,
        evaluation,
      },
    });

    return NextResponse.json({
      evaluation,
      response: saved,
      outputOptions: classConfig.outputOptions,
    });
  } catch (error) {
    if (error instanceof EvaluationRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Session evaluation failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "세션 평가를 처리하지 못했습니다." },
      { status: 500 },
    );
  }
}
