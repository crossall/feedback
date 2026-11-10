import { NextResponse } from "next/server";
import {
  normalizeEvaluationSessionConfig,
  validateEvaluationSessionConfig,
  type EvaluationSessionConfig,
} from "@/lib/evaluation-session";
import { encryptSessionClassConfig } from "@/lib/session-token";
import { isTeacherId } from "@/lib/teacher-evaluations";
import { isTeacherSessionFor } from "@/lib/server/teacher-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<EvaluationSessionConfig>;
    const config = normalizeEvaluationSessionConfig(body);
    if (
      !isTeacherId(config.teacherId ?? "")
      || !config.evaluationId
      || !await isTeacherSessionFor(config.teacherId ?? "")
    ) {
      return NextResponse.json(
        { error: "로그인 정보와 저장된 세션 정보를 확인해 주세요." },
        { status: 401 },
      );
    }
    const error = validateEvaluationSessionConfig(config);
    if (error) return NextResponse.json({ error }, { status: 400 });

    return NextResponse.json({ token: encryptSessionClassConfig(config) });
  } catch (error) {
    console.error("Session link creation failed:", error);
    return NextResponse.json(
      { error: "세션 링크를 만들지 못했습니다." },
      { status: 500 },
    );
  }
}
