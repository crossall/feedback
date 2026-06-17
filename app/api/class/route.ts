import { NextResponse } from "next/server";
import {
  defaultModelForProvider,
  encryptClassConfig,
  normalizeOutputOptions,
  providerFromModel,
  type ClassConfig,
} from "@/lib/class-config";
import { getTeacherApiKeys } from "@/lib/server/teacher-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ClassConfig> & {
      teacherId?: string;
      evaluationId?: string;
    };
    const model = body.model?.trim() || defaultModelForProvider("openai");
    const provider = providerFromModel(model, body.provider);
    const apiKeys = body.teacherId
      ? await getTeacherApiKeys(body.teacherId)
      : { openai: "", anthropic: "" };
    const config: ClassConfig = {
      apiKey: "",
      apiKeys: {},
      provider,
      model,
      classTitle: body.classTitle?.trim() ?? "",
      assignment: body.assignment?.trim() ?? "",
      rubric: body.rubric?.trim() ?? "",
      instruction: body.instruction?.trim() ?? "",
      outputOptions: normalizeOutputOptions(body.outputOptions),
      teacherId: body.teacherId?.trim() || undefined,
    };

    if (!apiKeys[provider] || !config.classTitle || !config.assignment || !config.rubric) {
      if (!config.classTitle || !config.assignment || !config.rubric) {
        return NextResponse.json(
          { error: "학급 링크 이름, 과제 설명, 루브릭을 모두 입력해 주세요." },
          { status: 400 },
        );
      }
      if (!body.teacherId) {
        return NextResponse.json(
          { error: "교사 ID로 입장한 뒤 학생용 링크를 만들어 주세요." },
          { status: 400 },
        );
      }
      const providerLabel = provider === "anthropic" ? "Claude" : "OpenAI";
      return NextResponse.json(
        { error: `${providerLabel} API 키가 없습니다. 먼저 내 평가 보관함에서 API 키를 저장해 주세요.` },
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
