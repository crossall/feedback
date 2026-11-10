import { NextResponse } from "next/server";
import { isTeacherId } from "@/lib/teacher-evaluations";
import { listPeerResponses } from "@/lib/server/peer-store";
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
    const evaluationId = new URL(request.url).searchParams.get("evaluation") ?? "";
    if (!evaluationId) {
      return NextResponse.json({ error: "동료평가를 확인해 주세요." }, { status: 400 });
    }
    return NextResponse.json({
      responses: await listPeerResponses(teacherId, evaluationId),
    });
  } catch (error) {
    console.error("Peer responses load failed:", error);
    return NextResponse.json(
      { error: "동료평가 응답을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
