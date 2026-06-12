import { NextResponse } from "next/server";
import { isTeacherId } from "@/lib/teacher-evaluations";
import { getGoogleConnectionStatus } from "@/lib/server/google-oauth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const teacherId = new URL(request.url).searchParams.get("teacher") ?? "";
  if (!isTeacherId(teacherId)) {
    return NextResponse.json({ error: "등록되지 않은 교사 ID입니다." }, { status: 404 });
  }
  return NextResponse.json(await getGoogleConnectionStatus(teacherId));
}
