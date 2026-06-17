import type { ClassConfig, LlmProvider } from "./class-config";
import { normalizeProviderApiKeys, providerFromModel } from "./class-config";
import type { Evaluation } from "./evaluation-result";

export const evaluationSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    totalScore: { type: "number" },
    maxScore: { type: "number" },
    summary: { type: "string" },
    criteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          score: { type: "number" },
          maxScore: { type: "number" },
          feedback: { type: "string" },
        },
        required: ["name", "score", "maxScore", "feedback"],
        additionalProperties: false,
      },
    },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    nextStep: { type: "string" },
  },
  required: [
    "title",
    "totalScore",
    "maxScore",
    "summary",
    "criteria",
    "strengths",
    "improvements",
    "nextStep",
  ],
  additionalProperties: false,
} as const;

export class EvaluationRequestError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
    this.name = "EvaluationRequestError";
  }
}

type PdfInput = {
  filename: string;
  base64: string;
};

function getOpenAIOutputText(response: {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}) {
  if (response.output_text) return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
}

function getAnthropicToolInput(response: {
  content?: Array<{ type?: string; name?: string; input?: unknown; text?: string }>;
}) {
  for (const item of response.content ?? []) {
    if (item.type === "tool_use" && item.name === "record_evaluation") {
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

function providerName(provider: LlmProvider) {
  return provider === "anthropic" ? "Claude" : "OpenAI";
}

export function getEvaluationProvider(config: ClassConfig) {
  const provider = providerFromModel(config.model, config.provider);
  const apiKeys = normalizeProviderApiKeys(config);
  return {
    provider,
    apiKey: apiKeys[provider],
    model: config.model.trim(),
  };
}

export async function requestEvaluation(input: {
  config: ClassConfig;
  prompt: string;
  pdf?: PdfInput;
  schemaName: string;
}): Promise<Evaluation> {
  const { provider, apiKey, model } = getEvaluationProvider(input.config);
  if (!apiKey) {
    throw new EvaluationRequestError(`${providerName(provider)} API 키를 입력해 주세요.`, 400);
  }
  return provider === "anthropic"
    ? requestAnthropicEvaluation({ ...input, apiKey, model })
    : requestOpenAIEvaluation({ ...input, apiKey, model });
}

async function requestOpenAIEvaluation(input: {
  apiKey: string;
  model: string;
  prompt: string;
  pdf?: PdfInput;
  schemaName: string;
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      input: input.pdf
        ? [
          {
            role: "user",
            content: [
              {
                type: "input_file",
                filename: input.pdf.filename,
                file_data: `data:application/pdf;base64,${input.pdf.base64}`,
              },
              { type: "input_text", text: input.prompt },
            ],
          },
        ]
        : input.prompt,
      text: {
        format: {
          type: "json_schema",
          name: input.schemaName,
          strict: true,
          schema: evaluationSchema,
        },
      },
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new EvaluationRequestError(
      body?.error?.message ?? "OpenAI 평가 요청에 실패했습니다.",
      response.status,
    );
  }
  const outputText = getOpenAIOutputText(body);
  if (!outputText) {
    throw new EvaluationRequestError("모델이 평가 결과를 반환하지 않았습니다. 다시 시도해 주세요.");
  }
  return JSON.parse(outputText) as Evaluation;
}

async function requestAnthropicEvaluation(input: {
  apiKey: string;
  model: string;
  prompt: string;
  pdf?: PdfInput;
}) {
  const content = input.pdf
    ? [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: input.pdf.base64,
        },
        title: input.pdf.filename,
      },
      { type: "text", text: input.prompt },
    ]
    : [{ type: "text", text: input.prompt }];

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
      messages: [{ role: "user", content }],
      tools: [
        {
          name: "record_evaluation",
          description: "Record the final student evaluation as structured data.",
          input_schema: evaluationSchema,
        },
      ],
      tool_choice: { type: "tool", name: "record_evaluation" },
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new EvaluationRequestError(
      body?.error?.message ?? "Claude 평가 요청에 실패했습니다.",
      response.status,
    );
  }
  const evaluation = getAnthropicToolInput(body);
  if (!evaluation) {
    throw new EvaluationRequestError("모델이 평가 결과를 반환하지 않았습니다. 다시 시도해 주세요.");
  }
  return evaluation as Evaluation;
}
