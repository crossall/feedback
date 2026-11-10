import { NextResponse } from "next/server";
import { isProjectTemplateId } from "@/lib/project-instances";
import { getTeacherSessionId } from "@/lib/server/teacher-accounts";
import {
  createProjectInstance,
  deleteProjectInstance,
  listProjectInstances,
} from "@/lib/server/project-instance-store";

export const runtime = "nodejs";

export async function GET() {
  const teacherId = await getTeacherSessionId();
  if (!teacherId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  return NextResponse.json({ instances: await listProjectInstances(teacherId) });
}

export async function DELETE(request: Request) {
  try {
    const teacherId = await getTeacherSessionId();
    if (!teacherId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const body = await request.json() as { instanceId?: string };
    await deleteProjectInstance(teacherId, String(body.instanceId ?? ""));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "프로젝트를 삭제하지 못했습니다." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const teacherId = await getTeacherSessionId();
    if (!teacherId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    if (!isProjectTemplateId(body.template)) {
      return NextResponse.json({ error: "복사할 프로젝트를 확인해 주세요." }, { status: 400 });
    }
    const instance = await createProjectInstance({
      teacherId,
      template: body.template,
      name: String(body.name ?? ""),
      copyRubric: body.copyRubric === true,
    });
    return NextResponse.json({ instance }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "프로젝트를 복사하지 못했습니다." },
      { status: 400 },
    );
  }
}
