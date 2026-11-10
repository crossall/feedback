import "server-only";

import { get, put } from "@vercel/blob";
import { isTeacherId, type TeacherId } from "@/lib/teacher-evaluations";
import {
  type EvaluationSessionConfig,
  type EvaluationSessionResponse,
  type EvaluationSessionStep,
  type SessionResponsePayload,
  type SessionRespondent,
} from "@/lib/evaluation-session";
import { normalizeQuestionAnswer, type QuestionAnswer } from "@/lib/rubric-levels";

function responsesPath(teacherId: TeacherId, sessionId: string) {
  return `session-responses/${teacherId}/${sessionId}.json`;
}

async function readSessionResponses(
  teacherId: TeacherId,
  sessionId: string,
): Promise<EvaluationSessionResponse[]> {
  const result = await get(responsesPath(teacherId, sessionId), {
    access: "private",
    useCache: false,
  });
  if (!result) return [];
  const body = await new Response(result.stream).json() as EvaluationSessionResponse[];
  return Array.isArray(body) ? body : [];
}

async function writeSessionResponses(
  teacherId: TeacherId,
  sessionId: string,
  responses: EvaluationSessionResponse[],
) {
  await put(responsesPath(teacherId, sessionId), JSON.stringify(responses), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function listSessionResponses(
  teacherIdValue: string,
  sessionId: string,
) {
  if (!isTeacherId(teacherIdValue) || !sessionId) return [];
  return readSessionResponses(teacherIdValue, sessionId);
}

function compactKey(value?: string | number) {
  return String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

function responseOwnerKey(response: EvaluationSessionResponse) {
  const respondent = response.respondent;
  const target = response.payload.type === "peer"
    ? response.payload.mode === "team"
      ? `team:${response.payload.target.teamNumber ?? ""}`
      : `student:${compactKey(response.payload.target.name)}`
    : "";
  return [
    compactKey(respondent.grade),
    compactKey(respondent.className),
    compactKey(respondent.name),
    compactKey(respondent.team),
    response.stepId,
    target,
  ].join("|");
}

function normalizeRespondent(input: Partial<SessionRespondent>): SessionRespondent {
  const respondent = {
    grade: input.grade?.trim() ?? "",
    className: input.className?.trim() ?? "",
    name: input.name?.trim() ?? "",
    team: input.team?.trim() || undefined,
  };
  if (!respondent.grade || !respondent.className || !respondent.name) {
    throw new Error("학년, 반, 이름을 모두 입력해 주세요.");
  }
  return respondent;
}

function validatePayload(step: EvaluationSessionStep, payload: SessionResponsePayload) {
  if ((step.kind === "pdf" || step.kind === "docs") && payload.type !== "ai") {
    throw new Error("평가 결과 형식이 올바르지 않습니다.");
  }
  if (step.kind === "peer" && payload.type !== "peer") {
    throw new Error("동료평가 응답 형식이 올바르지 않습니다.");
  }
  if (step.kind === "self" && payload.type !== "self") {
    throw new Error("자기평가 응답 형식이 올바르지 않습니다.");
  }
  if (step.kind === "reflection" && payload.type !== "reflection") {
    throw new Error("성찰 응답 형식이 올바르지 않습니다.");
  }
}

function normalizeAnswers(
  questions: {
    id: string;
    type: "score" | "text" | "level";
    maxScore: number;
    required: boolean;
    levels?: { id: string; label: string; score: number; description: string }[];
  }[],
  inputAnswers: QuestionAnswer[],
) {
  return questions.map((question) => {
    const input = inputAnswers.find((answer) => answer.questionId === question.id);
    return normalizeQuestionAnswer(question, input);
  });
}

function normalizePayload(
  step: EvaluationSessionStep,
  payload: SessionResponsePayload,
): SessionResponsePayload {
  if (step.kind === "peer" && payload.type === "peer") {
    return {
      ...payload,
      answers: normalizeAnswers(step.config.questions, payload.answers),
    };
  }
  if (step.kind === "self" && payload.type === "self") {
    return {
      ...payload,
      answers: normalizeAnswers(step.questions, payload.answers),
    };
  }
  return payload;
}

function createSessionResponse(input: {
  config: EvaluationSessionConfig;
  stepId: string;
  respondent: Partial<SessionRespondent>;
  payload: SessionResponsePayload;
}) {
  const teacherIdValue = input.config.teacherId ?? "";
  const sessionId = input.config.evaluationId ?? "";
  if (!isTeacherId(teacherIdValue) || !sessionId) {
    throw new Error("세션 링크 정보를 확인해 주세요.");
  }
  const teacherId = teacherIdValue;
  const step = input.config.steps.find(({ id }) => id === input.stepId);
  if (!step) throw new Error("세션 평가 단계를 찾을 수 없습니다.");
  validatePayload(step, input.payload);
  const payload = normalizePayload(step, input.payload);

  return {
    id: crypto.randomUUID(),
    teacherId,
    sessionId,
    sessionTitle: input.config.title,
    stepId: step.id,
    stepKind: step.kind,
    stepTitle: step.title,
    respondent: normalizeRespondent(input.respondent),
    payload,
    createdAt: new Date().toISOString(),
  };
}

export async function saveSessionResponses(input: {
  config: EvaluationSessionConfig;
  stepId: string;
  respondent: Partial<SessionRespondent>;
  payloads: SessionResponsePayload[];
}) {
  const teacherIdValue = input.config.teacherId ?? "";
  const sessionId = input.config.evaluationId ?? "";
  if (!isTeacherId(teacherIdValue) || !sessionId) {
    throw new Error("세션 링크 정보를 확인해 주세요.");
  }
  const teacherId = teacherIdValue;
  if (input.payloads.length === 0) {
    throw new Error("저장할 응답을 하나 이상 추가해 주세요.");
  }

  const responses = input.payloads.map((payload) => createSessionResponse({
    config: input.config,
    stepId: input.stepId,
    respondent: input.respondent,
    payload,
  }));

  const requestedKeys = new Set<string>();
  for (const response of responses) {
    const key = responseOwnerKey(response);
    if (requestedKeys.has(key)) {
      throw new Error("같은 대상을 중복해서 평가할 수 없습니다.");
    }
    requestedKeys.add(key);
  }

  const existing = await readSessionResponses(teacherId, sessionId);
  const next = [
    ...responses,
    ...existing.filter((item) => !requestedKeys.has(responseOwnerKey(item))),
  ];
  await writeSessionResponses(teacherId, sessionId, next);
  return responses;
}

export async function saveSessionResponse(input: {
  config: EvaluationSessionConfig;
  stepId: string;
  respondent: Partial<SessionRespondent>;
  payload: SessionResponsePayload;
}) {
  const responses = await saveSessionResponses({
    config: input.config,
    stepId: input.stepId,
    respondent: input.respondent,
    payloads: [input.payload],
  });
  return responses[0];
}
