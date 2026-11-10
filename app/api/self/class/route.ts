import { NextResponse } from "next/server";
import { isTeacherId } from "@/lib/teacher-evaluations";
import {
  normalizeSelfEvaluationConfig,
  validateSelfEvaluationConfig,
  type SelfEvaluationConfig,
} from "@/lib/self-evaluation";
import { encryptSelfClassConfig } from "@/lib/self-token";
import { isTeacherSessionFor } from "@/lib/server/teacher-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<SelfEvaluationConfig>;
    const config = normalizeSelfEvaluationConfig(body);
    if (
      !isTeacherId(config.teacherId ?? "")
      || !config.evaluationId
      || !await isTeacherSessionFor(config.teacherId ?? "")
    ) {
      return NextResponse.json(
        { error: "로그인 정보와 저장된 자기평가 정보를 확인해 주세요." },
        { status: 401 },
      );
    }
    const error = validateSelfEvaluationConfig(config);
    if (error) return NextResponse.json({ error }, { status: 400 });

    return NextResponse.json({ token: encryptSelfClassConfig(config) });
  } catch (error) {
    console.error("Self evaluation link creation failed:", error);
    return NextResponse.json(
      { error: "자기평가 링크를 만들지 못했습니다." },
      { status: 500 },
    );
  }
}
