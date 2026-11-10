import { NextResponse } from "next/server";
import { isTeacherId } from "@/lib/teacher-evaluations";
import { getGoogleConnectionStatus } from "@/lib/server/google-oauth";
import { isTeacherSessionFor } from "@/lib/server/teacher-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const teacherId = new URL(request.url).searchParams.get("teacher") ?? "";
  if (!isTeacherId(teacherId) || !await isTeacherSessionFor(teacherId)) {
    return NextResponse.json({ error: "로그인 정보가 일치하지 않습니다." }, { status: 401 });
  }
  return NextResponse.json(await getGoogleConnectionStatus(teacherId));
}
