import { NextResponse } from "next/server";
import {
  requestGeneratedQuestions,
  type GeneratedQuestionKind,
} from "@/lib/ai-question-generation";
import { getTeacherApiKeys } from "@/lib/server/teacher-store";
import { isTeacherId } from "@/lib/teacher-evaluations";
import { isTeacherSessionFor } from "@/lib/server/teacher-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      teacherId?: string;
      kind?: GeneratedQuestionKind;
      rubric?: string;
      title?: string;
      mode?: string;
    };

    if (
      !body.teacherId
      || !isTeacherId(body.teacherId)
      || !await isTeacherSessionFor(body.teacherId)
    ) {
      return NextResponse.json({ error: "로그인 정보를 확인해 주세요." }, { status: 401 });
    }
    if (body.kind !== "peer" && body.kind !== "self") {
      return NextResponse.json({ error: "생성할 평가 종류를 확인해 주세요." }, { status: 400 });
    }

    const apiKeys = await getTeacherApiKeys(body.teacherId);
    const result = await requestGeneratedQuestions({
      apiKey: apiKeys.anthropic,
      kind: body.kind,
      rubric: body.rubric?.trim() ?? "",
      title: body.title,
      mode: body.mode,
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error("AI question generation failed:", error);
    const status = error instanceof Error && "status" in error
      ? Number((error as { status?: number }).status) || 500
      : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "문항을 생성하지 못했습니다." },
      { status },
    );
  }
}
