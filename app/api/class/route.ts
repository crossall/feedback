import { NextResponse } from "next/server";
import {
  encryptClassConfig,
  normalizeOutputOptions,
  type ClassConfig,
} from "@/lib/class-config";
import { getStoredApiKey } from "@/lib/server/teacher-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ClassConfig> & {
      teacherId?: string;
      evaluationId?: string;
    };
    const storedApiKey = body.teacherId && body.evaluationId
      ? await getStoredApiKey(body.teacherId, body.evaluationId)
      : "";
    const config: ClassConfig = {
      apiKey: body.apiKey?.trim() || storedApiKey,
      model: body.model?.trim() || "gpt-5.5",
      classTitle: body.classTitle?.trim() ?? "",
      assignment: body.assignment?.trim() ?? "",
      rubric: body.rubric?.trim() ?? "",
      instruction: body.instruction?.trim() ?? "",
      outputOptions: normalizeOutputOptions(body.outputOptions),
    };

    if (!config.apiKey || !config.classTitle || !config.assignment || !config.rubric) {
      return NextResponse.json(
        { error: "API 키, 학급 링크 이름, 과제 설명, 루브릭을 모두 입력해 주세요." },
        { status: 400 },
      );
    }

    return NextResponse.json({ token: encryptClassConfig(config) });
  } catch (error) {
    console.error("Class link creation failed:", error);
    return NextResponse.json(
      { error: "학급 링크를 만들지 못했습니다. 서버 설정을 확인해 주세요." },
      { status: 500 },
    );
  }
}
