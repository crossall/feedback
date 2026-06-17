import { NextResponse } from "next/server";
import { isTeacherId } from "@/lib/teacher-evaluations";
import {
  getTeacherApiKeyStatus,
  saveTeacherApiKeys,
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
      hasApiKeys: await getTeacherApiKeyStatus(teacherId),
    });
  } catch (error) {
    console.error("Teacher API key status load failed:", error);
    return NextResponse.json(
      { error: "API 키 저장 상태를 불러오지 못했습니다." },
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
      openai?: string;
      anthropic?: string;
    };
    const hasApiKeys = await saveTeacherApiKeys(teacherId, {
      openai: body.openai,
      anthropic: body.anthropic,
    });
    return NextResponse.json({ hasApiKeys });
  } catch (error) {
    console.error("Teacher API key save failed:", error);
    return NextResponse.json(
      { error: "API 키를 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}
