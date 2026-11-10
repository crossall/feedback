import { NextResponse } from "next/server";
import { decryptPeerClassConfig } from "@/lib/peer-token";
import { savePeerResponse, savePeerResponses } from "@/lib/server/peer-store";
import type { PeerAnswer } from "@/lib/peer-evaluation";
import { internalPeerCollectionEnabled } from "@/lib/feature-flags";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!internalPeerCollectionEnabled) {
    return NextResponse.json(
      { error: "동료평가 응답은 선생님이 공유한 Google Form에서 제출해 주세요." },
      { status: 410 },
    );
  }

  try {
    const body = await request.json() as {
      classToken?: string;
      respondent?: {
        grade?: string;
        className?: string;
        name?: string;
        teamNumber?: number;
      };
      target?: {
        name?: string;
        teamNumber?: number;
      };
      answers?: PeerAnswer[];
      submissions?: {
        target?: {
          name?: string;
          teamNumber?: number;
        };
        answers?: PeerAnswer[];
      }[];
    };
    if (!body.classToken) {
      return NextResponse.json(
        { error: "선생님이 보내준 동료평가 링크로 접속해 주세요." },
        { status: 400 },
      );
    }
    const config = decryptPeerClassConfig(body.classToken);
    if (Array.isArray(body.submissions)) {
      const responses = await savePeerResponses({
        config,
        submissions: body.submissions.map((submission) => ({
          respondent: body.respondent ?? {},
          target: submission.target ?? {},
          answers: submission.answers ?? [],
        })),
      });
      return NextResponse.json({ responses });
    }

    const response = await savePeerResponse({
      config,
      respondent: body.respondent ?? {},
      target: body.target ?? {},
      answers: body.answers ?? [],
    });
    return NextResponse.json({ response });
  } catch (error) {
    console.error("Peer response save failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "동료평가 응답을 저장하지 못했습니다." },
      { status: 400 },
    );
  }
}
