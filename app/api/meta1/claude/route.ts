import { NextResponse } from "next/server";
import { getTeacherApiKeys } from "@/lib/server/teacher-store";

export const runtime = "nodejs";
export const maxDuration = 60;

type AnthropicMessage = {
  role: "user" | "assistant";
  content:
  | string
  | Array<
    | { type: "text"; text: string }
    | {
      type: "document";
      source:
      | { type: "base64"; media_type: "application/pdf"; data: string }
      | { type: "url"; url: string }
      | { type: "file"; file_id: string };
    }
  >;
};

const META1_FACT_CHECK_INSTRUCTION =
  "추가 규칙: 사실 확인을 꼭 하세요. 쉬운 표현이나 다른 말로 설명한 것은 허용하되, 식물의 구조·기능·생장·분류·생태 등에 대한 과학적 사실 오류는 그냥 넘기지 말고 해당 항목 rating을 낮추며 improve에 바로잡을 내용을 포함하세요. PDF에 특정 식물 이름이나 구체적인 식물 정보가 나오면 web_search 도구로 신뢰할 수 있는 자료를 찾아 대조하세요. 사실 오류를 발견하면 improve의 첫머리를 '사실 확인:'으로 시작하고, 잘못된 내용과 바르게 고칠 내용을 초등학생이 이해할 수 있게 구체적으로 적으세요. 확실하지 않은 내용은 단정하지 말고 자료로 다시 확인하라고 안내하세요.";

const META1_WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 5,
  user_location: {
    type: "approximate",
    country: "KR",
    timezone: "Asia/Seoul",
  },
};

function maxTokens(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(256, Math.min(4096, Math.round(numeric)))
    : 1000;
}

function hasDocumentContent(message: AnthropicMessage) {
  return Array.isArray(message.content)
    && message.content.some((content) => content.type === "document");
}

function includesFactCheckInstruction(message: AnthropicMessage) {
  if (typeof message.content === "string") {
    return message.content.includes("사실 확인을 꼭 하세요");
  }
  return message.content.some((content) =>
    content.type === "text" && content.text.includes("사실 확인을 꼭 하세요"));
}

function messagesWithFactCheck(messages: AnthropicMessage[]) {
  if (!messages.some(hasDocumentContent) || messages.some(includesFactCheckInstruction)) {
    return messages;
  }

  let targetIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      targetIndex = i;
      break;
    }
  }
  if (targetIndex === -1) return messages;

  return messages.map((message, index) => {
    if (index !== targetIndex) return message;
    if (typeof message.content === "string") {
      return {
        ...message,
        content: `${message.content}\n\n${META1_FACT_CHECK_INSTRUCTION}`,
      };
    }
    return {
      ...message,
      content: [
        ...message.content,
        { type: "text" as const, text: META1_FACT_CHECK_INSTRUCTION },
      ],
    };
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      messages?: AnthropicMessage[];
      maxTokens?: number;
      temperature?: number;
    };
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: "Claude 메시지를 확인해 주세요." }, { status: 400 });
    }

    const shouldUseWebSearch = body.messages.some(hasDocumentContent);
    const messages = messagesWithFactCheck(body.messages);

    const apiKeys = await getTeacherApiKeys("4523");
    const apiKey =
      process.env.META1_ANTHROPIC_API_KEY?.trim()
      || process.env.PROJECT1_ANTHROPIC_API_KEY?.trim()
      || apiKeys.anthropic;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Claude API 키가 없습니다. 교사 보관함에 Claude API 키를 저장해 주세요." },
        { status: 400 },
      );
    }

    const claudePayload = {
      model: "claude-opus-4-8",
      max_tokens: maxTokens(body.maxTokens),
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      ...(shouldUseWebSearch ? { tools: [META1_WEB_SEARCH_TOOL] } : {}),
    };

    let response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(claudePayload),
    });

    let data = await response.json();
    if (!response.ok && shouldUseWebSearch && data?.error?.type === "invalid_request_error") {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...claudePayload,
          tools: undefined,
        }),
      });
      data = await response.json();
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "Claude 요청에 실패했습니다." },
        { status: response.status },
      );
    }

    const text = (data.content ?? [])
      .filter((content: { type?: string; text?: string }) => content.type === "text" && content.text)
      .map((content: { text: string }) => content.text)
      .join("\n");

    return NextResponse.json({
      text,
      webSearchRequests: data.usage?.server_tool_use?.web_search_requests || 0,
    });
  } catch (error) {
    console.error("Meta1 Claude request failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Claude 요청을 처리하지 못했습니다." },
      { status: 500 },
    );
  }
}
