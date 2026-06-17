import { NextResponse } from "next/server";
import {
  defaultModelForProvider,
  encryptClassConfig,
  normalizeOutputOptions,
  normalizeProvider,
  normalizeProviderApiKeys,
  type ClassConfig,
} from "@/lib/class-config";
import { getStoredApiKeys } from "@/lib/server/teacher-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ClassConfig> & {
      teacherId?: string;
      evaluationId?: string;
    };
    const storedApiKeys = body.teacherId && body.evaluationId
      ? await getStoredApiKeys(body.teacherId, body.evaluationId)
      : { openai: "", anthropic: "" };
    const provider = normalizeProvider(body.provider);
    const submittedApiKeys = normalizeProviderApiKeys(body);
    const apiKeys = {
      openai: submittedApiKeys.openai || storedApiKeys.openai,
      anthropic: submittedApiKeys.anthropic || storedApiKeys.anthropic,
    };
    const config: ClassConfig = {
      apiKey: apiKeys[provider],
      apiKeys,
      provider,
      model: body.model?.trim() || defaultModelForProvider(provider),
      classTitle: body.classTitle?.trim() ?? "",
      assignment: body.assignment?.trim() ?? "",
      rubric: body.rubric?.trim() ?? "",
      instruction: body.instruction?.trim() ?? "",
      outputOptions: normalizeOutputOptions(body.outputOptions),
      teacherId: body.teacherId?.trim() || undefined,
    };

    if (!config.apiKey || !config.classTitle || !config.assignment || !config.rubric) {
      return NextResponse.json(
        { error: "선택한 평가 모델의 API 키, 학급 링크 이름, 과제 설명, 루브릭을 모두 입력해 주세요." },
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
