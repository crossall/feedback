import { NextResponse } from "next/server";
import { decryptSessionClassConfig } from "@/lib/session-token";
import { saveSessionResponse, saveSessionResponses } from "@/lib/server/session-store";
import type { SessionRespondent, SessionResponsePayload } from "@/lib/evaluation-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      sessionToken?: string;
      stepId?: string;
      respondent?: Partial<SessionRespondent>;
      payload?: SessionResponsePayload;
      submissions?: {
        payload?: SessionResponsePayload;
      }[];
    };
    if (!body.sessionToken || !body.stepId || (!body.payload && !Array.isArray(body.submissions))) {
      return NextResponse.json(
        { error: "세션 응답 정보를 확인해 주세요." },
        { status: 400 },
      );
    }
    const config = decryptSessionClassConfig(body.sessionToken);
    if (Array.isArray(body.submissions)) {
      const responses = await saveSessionResponses({
        config,
        stepId: body.stepId,
        respondent: body.respondent ?? {},
        payloads: body.submissions
          .map((submission) => submission.payload)
          .filter((payload): payload is SessionResponsePayload => Boolean(payload)),
      });
      return NextResponse.json({ responses });
    }

    if (!body.payload) {
      return NextResponse.json(
        { error: "세션 응답 정보를 확인해 주세요." },
        { status: 400 },
      );
    }
    const response = await saveSessionResponse({
      config,
      stepId: body.stepId,
      respondent: body.respondent ?? {},
      payload: body.payload,
    });
    return NextResponse.json({ response });
  } catch (error) {
    console.error("Session response save failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "세션 응답을 저장하지 못했습니다." },
      { status: 400 },
    );
  }
}
