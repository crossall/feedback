import { NextResponse } from "next/server";
import { isTeacherId, type EvaluationType } from "@/lib/teacher-evaluations";
import {
  normalizeOutputOptions,
  type ClassConfig,
} from "@/lib/class-config";
import {
  deleteTeacherEvaluation,
  listTeacherEvaluations,
  saveTeacherEvaluation,
} from "@/lib/server/teacher-store";

export const runtime = "nodejs";

function invalidTeacher() {
  return NextResponse.json({ error: "등록되지 않은 교사 ID입니다." }, { status: 404 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teacherId: string }> },
) {
  try {
    const { teacherId } = await params;
    if (!isTeacherId(teacherId)) return invalidTeacher();
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
    if (!isTeacherId(teacherId)) return invalidTeacher();
    const body = await request.json() as {
      type?: EvaluationType;
      config?: Partial<ClassConfig>;
      evaluationId?: string;
    };
    if (body.type !== "pdf" && body.type !== "docs") {
      return NextResponse.json({ error: "평가 형식을 확인해 주세요." }, { status: 400 });
    }
    const config: ClassConfig = {
      apiKey: body.config?.apiKey?.trim() ?? "",
      model: body.config?.model?.trim() || "gpt-5.5",
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
    if (!isTeacherId(teacherId)) return invalidTeacher();
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
