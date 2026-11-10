import { NextResponse } from "next/server";
import { isTeacherId, type EvaluationType } from "@/lib/teacher-evaluations";
import {
  defaultModelForProvider,
  normalizeOutputOptions,
  normalizeProviderApiKeys,
  providerFromModel,
  type ClassConfig,
} from "@/lib/class-config";
import {
  normalizePeerEvaluationConfig,
  validatePeerEvaluationConfig,
  type PeerEvaluationConfig,
} from "@/lib/peer-evaluation";
import {
  normalizeEvaluationSessionConfig,
  validateEvaluationSessionConfig,
  type EvaluationSessionConfig,
} from "@/lib/evaluation-session";
import {
  deleteTeacherEvaluation,
  listTeacherEvaluations,
  saveTeacherEvaluation,
} from "@/lib/server/teacher-store";
import { isTeacherSessionFor } from "@/lib/server/teacher-accounts";

export const runtime = "nodejs";

function invalidTeacher() {
  return NextResponse.json({ error: "로그인 정보가 일치하지 않습니다." }, { status: 401 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teacherId: string }> },
) {
  try {
    const { teacherId } = await params;
    if (!isTeacherId(teacherId) || !await isTeacherSessionFor(teacherId)) return invalidTeacher();
    return NextResponse.json({
      evaluations: await listTeacherEvaluations(teacherId),
    });
  } catch (error) {
    console.error("Teacher evaluations load failed:", error);
    return NextResponse.json(
      { error: "교사 평가 보관함을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teacherId: string }> },
) {
  try {
    const { teacherId } = await params;
    if (!isTeacherId(teacherId) || !await isTeacherSessionFor(teacherId)) return invalidTeacher();
    const body = await request.json() as {
      type?: EvaluationType;
      config?: Partial<ClassConfig> & Partial<PeerEvaluationConfig> & Partial<EvaluationSessionConfig>;
      evaluationId?: string;
    };
    if (
      body.type !== "pdf"
      && body.type !== "docs"
      && body.type !== "peer"
      && body.type !== "session"
    ) {
      return NextResponse.json({ error: "평가 형식을 확인해 주세요." }, { status: 400 });
    }
    if (body.type === "session") {
      const config = normalizeEvaluationSessionConfig({
        ...body.config,
        teacherId,
        evaluationId: body.evaluationId,
      });
      const error = validateEvaluationSessionConfig(config);
      if (error) {
        return NextResponse.json({ error }, { status: 400 });
      }
      const evaluation = await saveTeacherEvaluation({
        teacherId,
        type: "session",
        config,
        evaluationId: body.evaluationId,
      });
      return NextResponse.json({ evaluation });
    }

    if (body.type === "peer") {
      const config = normalizePeerEvaluationConfig({
        ...body.config,
        teacherId,
        evaluationId: body.evaluationId,
      });
      const error = validatePeerEvaluationConfig(config);
      if (error) {
        return NextResponse.json({ error }, { status: 400 });
      }
      const evaluation = await saveTeacherEvaluation({
        teacherId,
        type: "peer",
        config,
        evaluationId: body.evaluationId,
      });
      return NextResponse.json({ evaluation });
    }

    const model = body.config?.model?.trim() || defaultModelForProvider("openai");
    const provider = providerFromModel(model, body.config?.provider);
    const config: ClassConfig = {
      apiKey: body.config?.apiKey?.trim() ?? "",
      apiKeys: normalizeProviderApiKeys(body.config),
      provider,
      model,
      classTitle: body.config?.classTitle?.trim() ?? "",
      assignment: body.config?.assignment?.trim() ?? "",
      rubric: body.config?.rubric?.trim() ?? "",
      instruction: body.config?.instruction?.trim() ?? "",
      outputOptions: normalizeOutputOptions(body.config?.outputOptions),
    };
    if (!config.classTitle || !config.assignment || !config.rubric) {
      return NextResponse.json(
        { error: "학급 링크 이름, 과제 설명, 루브릭을 모두 입력해 주세요." },
        { status: 400 },
      );
    }
    const evaluation = await saveTeacherEvaluation({
      teacherId,
      type: body.type,
      config,
      evaluationId: body.evaluationId,
    });
    return NextResponse.json({ evaluation });
  } catch (error) {
    console.error("Teacher evaluation save failed:", error);
    return NextResponse.json(
      { error: "평가를 서버 보관함에 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ teacherId: string }> },
) {
  try {
    const { teacherId } = await params;
    if (!isTeacherId(teacherId) || !await isTeacherSessionFor(teacherId)) return invalidTeacher();
    const body = await request.json() as { evaluationId?: string };
    if (!body.evaluationId) {
      return NextResponse.json({ error: "삭제할 평가를 확인해 주세요." }, { status: 400 });
    }
    await deleteTeacherEvaluation(teacherId, body.evaluationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Teacher evaluation delete failed:", error);
    return NextResponse.json(
      { error: "평가를 삭제하지 못했습니다." },
      { status: 500 },
    );
  }
}
