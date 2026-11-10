import {
  maxScoreFromLevels,
  normalizeRubricLevels,
  type RubricLevel,
} from "./rubric-levels";

export type GeneratedQuestionKind = "peer" | "self";

export type GeneratedQuestion = {
  id: string;
  prompt: string;
  type: "score" | "text" | "level";
  maxScore: number;
  required: boolean;
  levels?: RubricLevel[];
};

export type GeneratedQuestionSet = {
  title: string;
  description: string;
  questions: GeneratedQuestion[];
  model: string;
};

export class QuestionGenerationError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
    this.name = "QuestionGenerationError";
  }
}

const questionGenerationModels = ["claude-opus-4-8", "claude-opus-4-7"] as const;

const generatedQuestionSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          type: { type: "string", enum: ["score", "text", "level"] },
          maxScore: { type: "number" },
          required: { type: "boolean" },
          levels: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                score: { type: "number" },
                description: { type: "string" },
              },
              required: ["id", "label", "score", "description"],
              additionalProperties: false,
            },
          },
        },
        required: ["prompt", "type", "maxScore", "required"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "description", "questions"],
  additionalProperties: false,
} as const;

function getAnthropicToolInput(response: {
  content?: Array<{ type?: string; name?: string; input?: unknown; text?: string }>;
}) {
  for (const item of response.content ?? []) {
    if (item.type === "tool_use" && item.name === "record_generated_questions") {
      return item.input;
    }
  }

  const text = response.content
    ?.filter((item) => item.type === "text" && item.text)
    .map((item) => item.text)
    .join("\n")
    .trim();

  return text ? JSON.parse(text) : undefined;
}

function normalizeGeneratedQuestionSet(
  value: Partial<GeneratedQuestionSet>,
  model: string,
): GeneratedQuestionSet {
  const questions = Array.isArray(value.questions)
    ? value.questions
      .slice(0, 8)
      .map((question, index) => {
        const maxScore = Number(question.maxScore);
        const hasLevels = Array.isArray(question.levels) && question.levels.length > 0;
        const type: GeneratedQuestion["type"] = question.type === "text"
          ? "text"
          : question.type === "level" || hasLevels
            ? "level"
            : "score";
        const normalizedMaxScore = Number.isFinite(maxScore)
          ? Math.max(1, Math.min(100, Math.round(maxScore)))
          : 5;
        const levels = type === "level"
          ? normalizeRubricLevels(question.levels, normalizedMaxScore)
          : undefined;
        return {
          id: crypto.randomUUID(),
          prompt: question.prompt?.trim() || `질문 ${index + 1}`,
          type,
          maxScore: type === "level" ? maxScoreFromLevels(levels, normalizedMaxScore) : normalizedMaxScore,
          required: question.required !== false,
          ...(levels ? { levels } : {}),
        };
      })
      .filter((question) => question.prompt)
    : [];

  if (questions.length === 0) {
    throw new QuestionGenerationError("생성된 질문을 확인하지 못했습니다. 다시 생성해 주세요.");
  }
  if (questions.length < 3) {
    throw new QuestionGenerationError("생성된 질문이 너무 적습니다. 다시 생성해 주세요.");
  }

  return {
    title: value.title?.trim() || "AI 생성 평가",
    description: value.description?.trim() || "루브릭을 바탕으로 생성한 평가입니다.",
    questions,
    model,
  };
}

function buildPrompt(input: {
  kind: GeneratedQuestionKind;
  rubric: string;
  title?: string;
  mode?: string;
}) {
  const target = input.kind === "peer" ? "동료평가" : "자기평가";
  const modeLine = input.kind === "peer"
    ? `동료평가 방식: ${input.mode === "team" ? "모둠 동료평가" : "개인 동료평가"}`
    : "자기평가 방식: 학생이 자기 수행과 배움을 성찰합니다.";

  return `
교사가 입력한 루브릭을 분석해 ${target} 문항을 생성하세요.

원칙:
- 초중등 학생이 이해할 수 있는 자연스러운 한국어로 작성합니다.
- 루브릭의 핵심 평가 기준을 빠뜨리지 않습니다.
- 루브릭에 상/중/하와 (15/12/9), (20/16/12)처럼 수준별 점수가 있으면 type은 반드시 "level"로 만들고 levels에 상/중/하의 score와 description을 그대로 옮깁니다.
- 점수만 직접 입력하게 할 필요가 있을 때만 "score"를 사용합니다. 상중하 루브릭은 "score"가 아니라 "level"입니다.
- "좋은 점", "더 좋아질 점"처럼 점수가 없는 주관식 항목은 "text"로 만듭니다.
- 동료평가는 친구의 관찰 가능한 행동과 기여를 묻습니다.
- 자기평가는 학생이 자기 자신을 평가하도록 "나는", "내가" 기준의 문장으로 바꿉니다.
- 학생이 서로를 공격하거나 낙인찍는 표현을 쓰지 않게 질문을 중립적으로 만듭니다.
- 반드시 제공된 JSON 스키마에 맞는 구조화 결과만 도구로 기록합니다.

현재 제목: ${input.title?.trim() || "없음"}
${modeLine}

[루브릭]
${input.rubric}
`.trim();
}

async function requestAnthropicGeneratedQuestions(input: {
  apiKey: string;
  model: string;
  kind: GeneratedQuestionKind;
  rubric: string;
  title?: string;
  mode?: string;
}) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: buildPrompt(input) }],
        },
      ],
      tools: [
        {
          name: "record_generated_questions",
          description: "Record generated Korean peer or self evaluation questions as structured JSON.",
          input_schema: generatedQuestionSchema,
          strict: true,
        },
      ],
      tool_choice: { type: "tool", name: "record_generated_questions" },
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new QuestionGenerationError(
      body?.error?.message ?? "Claude 문항 생성 요청에 실패했습니다.",
      response.status,
    );
  }

  const generated = getAnthropicToolInput(body);
  if (!generated) {
    throw new QuestionGenerationError("Claude가 생성 결과를 반환하지 않았습니다. 다시 생성해 주세요.");
  }

  return normalizeGeneratedQuestionSet(generated as Partial<GeneratedQuestionSet>, input.model);
}

function canTryFallback(error: QuestionGenerationError) {
  return error.status === 400 || error.status === 404;
}

export async function requestGeneratedQuestions(input: {
  apiKey: string;
  kind: GeneratedQuestionKind;
  rubric: string;
  title?: string;
  mode?: string;
}) {
  if (!input.apiKey) {
    throw new QuestionGenerationError("Claude API 키가 없습니다. 먼저 내 평가 보관함에서 API 키를 저장해 주세요.", 400);
  }
  if (input.rubric.trim().length < 20) {
    throw new QuestionGenerationError("루브릭을 조금 더 구체적으로 입력해 주세요.", 400);
  }

  let lastError: QuestionGenerationError | undefined;
  for (const model of questionGenerationModels) {
    try {
      return await requestAnthropicGeneratedQuestions({ ...input, model });
    } catch (error) {
      if (!(error instanceof QuestionGenerationError)) throw error;
      lastError = error;
      if (!canTryFallback(error)) break;
    }
  }

  throw lastError ?? new QuestionGenerationError("문항을 생성하지 못했습니다.");
}
