import { NextResponse } from "next/server";
import { isTeacherId } from "@/lib/teacher-evaluations";
import {
  normalizePeerEvaluationConfig,
  validatePeerEvaluationConfig,
  type PeerEvaluationConfig,
} from "@/lib/peer-evaluation";
import { encryptPeerClassConfig } from "@/lib/peer-token";
import { internalPeerCollectionEnabled } from "@/lib/feature-flags";
import { isTeacherSessionFor } from "@/lib/server/teacher-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!internalPeerCollectionEnabled) {
    return NextResponse.json(
      { error: "동료평가는 Google Form 방식으로 전환되었습니다." },
      { status: 410 },
    );
  }

  try {
    const body = await request.json() as Partial<PeerEvaluationConfig>;
    const config = normalizePeerEvaluationConfig(body);
    if (
      !isTeacherId(config.teacherId ?? "")
      || !config.evaluationId
      || !await isTeacherSessionFor(config.teacherId ?? "")
    ) {
      return NextResponse.json(
        { error: "로그인 정보와 저장된 평가 정보를 확인해 주세요." },
        { status: 401 },
      );
    }
    const error = validatePeerEvaluationConfig(config);
    if (error) return NextResponse.json({ error }, { status: 400 });

    return NextResponse.json({ token: encryptPeerClassConfig(config) });
  } catch (error) {
    console.error("Peer class link creation failed:", error);
    return NextResponse.json(
      { error: "동료평가 링크를 만들지 못했습니다." },
      { status: 500 },
    );
  }
}
