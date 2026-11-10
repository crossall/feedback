import { NextResponse } from "next/server";
import {
  Project1ClaudeError,
  requestProject1Claude,
  type Project1AnthropicMessage,
} from "@/lib/server/project1-claude";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      messages?: Project1AnthropicMessage[];
      maxTokens?: number;
      instanceId?: string;
    };
    const result = await requestProject1Claude({
      messages: body.messages || [],
      maxTokens: body.maxTokens,
      instanceId: body.instanceId,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Project1 Claude request failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Claude 요청을 처리하지 못했습니다." },
      { status: error instanceof Project1ClaudeError ? error.status : 500 },
    );
  }
}
