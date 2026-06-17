import { NextResponse } from "next/server";
import { decryptClassConfig } from "@/lib/class-config";
import { EvaluationRequestError, requestEvaluation } from "@/lib/llm-evaluation";
import { getTeacherApiKeys } from "@/lib/server/teacher-store";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const classToken = String(form.get("classToken") ?? "").trim();
    const studentGrade = String(form.get("studentGrade") ?? "").trim();
    const studentClass = String(form.get("studentClass") ?? "").trim();
    const studentName = String(form.get("studentName") ?? "").trim();
    const studentTeam = String(form.get("studentTeam") ?? "").trim();

    if (!(file instanceof File) || file.type !== "application/pdf") {
      return NextResponse.json({ error: "올바른 PDF 파일이 필요합니다." }, { status: 400 });
    }
    if (!classToken) {
      return NextResponse.json({ error: "선생님이 만든 학급 링크로 접속해 주세요." }, { status: 400 });
    }
    if (!studentGrade || !studentClass || !studentName) {
      return NextResponse.json(
        { error: "학년, 반, 이름을 모두 입력해 주세요." },
        { status: 400 },
      );
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF 파일은 15MB 이하여야 합니다." }, { status: 413 });
    }

    let classConfig;
    try {
      classConfig = decryptClassConfig(classToken);
    } catch {
      return NextResponse.json(
        { error: "학급 링크가 올바르지 않습니다. 선생님께 새 링크를 요청해 주세요." },
        { status: 400 },
      );
    }
    const teacherApiKeys = await getTeacherApiKeys(classConfig.teacherId ?? "");
    classConfig = {
      ...classConfig,
      apiKeys: {
        openai: teacherApiKeys.openai || classConfig.apiKeys?.openai || classConfig.apiKey,
        anthropic: teacherApiKeys.anthropic || classConfig.apiKeys?.anthropic || "",
      },
    };

    const bytes = Buffer.from(await file.arrayBuffer());
    const prompt = `당신은 학생의 PDF 학습 결과물을 평가하는 공정하고 따뜻한 교사입니다.

[과제]
${classConfig.assignment}

[평가 루브릭]
${classConfig.rubric}

[추가 지시]
${classConfig.instruction}

[제출자]
학년: ${studentGrade}
반: ${studentClass}
이름: ${studentName}
모둠: ${studentTeam || "개인 제출"}

PDF의 모든 페이지에서 글, 이미지, 표, 도표, 레이아웃 등 제출물에 포함된 요소를 살펴보세요.
과목이나 결과물 형식을 미리 가정하지 말고, 위 과제 설명과 평가 루브릭을 기준으로 평가하세요.
루브릭의 항목명과 배점을 그대로 최대한 유지해 항목별로 평가하세요. 전체 만점은 루브릭이나 추가 지시가 정한 배점 합계를 따르고, 별도 지시가 없을 때만 루브릭에 적힌 배점 합계를 사용하세요.
총점은 각 항목 점수의 합과 일치해야 합니다.
강점과 개선점은 각각 2~4개로, PDF에서 확인한 구체적인 근거를 들어 작성하세요.
학생이 바로 실행할 수 있는 가장 중요한 다음 수정 행동을 마지막에 한 문장으로 제안하세요.`;

    const evaluation = await requestEvaluation({
      config: classConfig,
      prompt,
      pdf: {
        filename: file.name,
        base64: bytes.toString("base64"),
      },
      schemaName: "student_pdf_evaluation",
    });
    return NextResponse.json({
      ...evaluation,
      outputOptions: classConfig.outputOptions,
    });
  } catch (error) {
    if (error instanceof EvaluationRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Evaluation failed:", error);
    return NextResponse.json(
      { error: "평가 결과를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
