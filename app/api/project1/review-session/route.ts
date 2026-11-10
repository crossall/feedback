import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import {
  createTeacherSessionToken,
  TEACHER_SESSION_COOKIE,
  teacherSessionCookieOptions,
  isTeacherSessionFor,
} from "@/lib/server/teacher-accounts";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ authenticated: await isTeacherSessionFor("6556") });
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { password?: string };
    const supplied = digest(String(body.password ?? "").trim());
    const expected = digest(process.env.PROJECT1_TEACHER_PASSWORD?.trim() || "6556");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return NextResponse.json({ error: "비밀번호가 맞지 않습니다." }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      TEACHER_SESSION_COOKIE,
      createTeacherSessionToken("6556"),
      teacherSessionCookieOptions,
    );
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "교사 로그인을 확인하지 못했습니다." },
      { status: 500 },
    );
  }
}
