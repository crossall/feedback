import { NextResponse } from "next/server";
import {
  authenticateTeacher,
  createTeacherSessionToken,
  registerTeacher,
  TEACHER_SESSION_COOKIE,
  teacherSessionCookieOptions,
} from "@/lib/server/teacher-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action?: "login" | "register";
      name?: string;
      teacherId?: string;
    };
    const account = body.action === "register"
      ? await registerTeacher(body.name ?? "", body.teacherId ?? "")
      : await authenticateTeacher(body.name ?? "", body.teacherId ?? "");
    const response = NextResponse.json({
      teacherId: account.teacherId,
      name: account.name,
    });
    response.cookies.set(
      TEACHER_SESSION_COOKIE,
      createTeacherSessionToken(account.teacherId),
      teacherSessionCookieOptions,
    );
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "교사 계정을 확인하지 못했습니다." },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(TEACHER_SESSION_COOKIE, "", {
    ...teacherSessionCookieOptions,
    maxAge: 0,
  });
  return response;
}
