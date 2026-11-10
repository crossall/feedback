import { NextResponse } from "next/server";
import { encryptClassConfig, providerFromModel } from "@/lib/class-config";
import { isTeacherId } from "@/lib/teacher-evaluations";
import {
  getTeacherApiKeys,
  listTeacherEvaluations,
} from "@/lib/server/teacher-store";
import { isTeacherSessionFor } from "@/lib/server/teacher-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      teacherId?: string;
      evaluationId?: string;
      type?: "pdf" | "docs";
    };
    const teacherId = body.teacherId?.trim() ?? "";
    const evaluationId = body.evaluationId?.trim() ?? "";

    if (!isTeacherId(teacherId) || !evaluationId || !await isTeacherSessionFor(teacherId)) {
      return NextResponse.json(
        { error: "로그인 정보와 저장된 평가를 확인해 주세요." },
        { status: 401 },
      );
    }

    const evaluation = (await listTeacherEvaluations(teacherId)).find(
      (item) => item.id === evaluationId,
    );
    if (
      !evaluation
      || (evaluation.type !== "pdf" && evaluation.type !== "docs")
      || evaluation.type !== body.type
    ) {
      return NextResponse.json(
        { error: "저장된 평가 형식을 확인해 주세요." },
        { status: 404 },
      );
    }

    const provider = providerFromModel(evaluation.config.model, evaluation.config.provider);
    const apiKeys = await getTeacherApiKeys(teacherId);
    if (!apiKeys[provider]) {
      return NextResponse.json(
        { error: `${provider === "anthropic" ? "Claude" : "OpenAI"} API 키를 먼저 교사 보관함에 저장해 주세요.` },
        { status: 400 },
      );
    }

    return NextResponse.json({
      token: encryptClassConfig({
        ...evaluation.config,
        teacherId,
        submissionMode: "teacher",
      }),
    });
  } catch (error) {
    console.error("Teacher evaluation token creation failed:", error);
    return NextResponse.json(
      { error: "교사용 평가를 준비하지 못했습니다." },
      { status: 500 },
    );
  }
}
