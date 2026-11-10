import { NextResponse } from "next/server";
import { decryptSelfClassConfig } from "@/lib/self-token";
import { saveSelfResponse } from "@/lib/server/self-store";
import type { SelfAnswer } from "@/lib/self-evaluation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      classToken?: string;
      respondent?: {
        grade?: string;
        className?: string;
        name?: string;
        team?: string;
      };
      answers?: SelfAnswer[];
    };
    if (!body.classToken) {
      return NextResponse.json(
        { error: "선생님이 보내 준 자기평가 링크로 접속해 주세요." },
        { status: 400 },
      );
    }
    const config = decryptSelfClassConfig(body.classToken);
    const response = await saveSelfResponse({
      config,
      submission: {
        respondent: body.respondent ?? {},
        answers: body.answers ?? [],
      },
    });
    return NextResponse.json({ response });
  } catch (error) {
    console.error("Self response save failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "자기평가 응답을 저장하지 못했습니다." },
      { status: 400 },
    );
  }
}
