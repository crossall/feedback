import { NextResponse } from "next/server";
import { isTeacherId } from "@/lib/teacher-evaluations";
import { listSessionResponses } from "@/lib/server/session-store";
import { isTeacherSessionFor } from "@/lib/server/teacher-accounts";

export const runtime = "nodejs";

function invalidTeacher() {
  return NextResponse.json({ error: "로그인 정보가 일치하지 않습니다." }, { status: 401 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teacherId: string }> },
) {
  try {
    const { teacherId } = await params;
    if (!isTeacherId(teacherId) || !await isTeacherSessionFor(teacherId)) return invalidTeacher();
    const sessionId = new URL(request.url).searchParams.get("session") ?? "";
    return NextResponse.json({
      responses: await listSessionResponses(teacherId, sessionId),
    });
  } catch (error) {
    console.error("Session responses load failed:", error);
    return NextResponse.json(
      { error: "세션 응답 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
