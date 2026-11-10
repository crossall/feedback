import "server-only";

import { get, put } from "@vercel/blob";
import { isTeacherId, type TeacherId } from "@/lib/teacher-evaluations";
import {
  type SelfAnswer,
  type SelfEvaluationConfig,
  type SelfEvaluationResponse,
} from "@/lib/self-evaluation";
import { normalizeQuestionAnswer } from "@/lib/rubric-levels";

type SelfResponseInput = {
  respondent: {
    grade?: string;
    className?: string;
    name?: string;
    team?: string;
  };
  answers?: SelfAnswer[];
};

function responsesPath(teacherId: TeacherId, evaluationId: string) {
  return `self-responses/${teacherId}/${evaluationId}.json`;
}

async function readSelfResponses(
  teacherId: TeacherId,
  evaluationId: string,
): Promise<SelfEvaluationResponse[]> {
  const result = await get(responsesPath(teacherId, evaluationId), {
    access: "private",
    useCache: false,
  });
  if (!result) return [];
  const body = await new Response(result.stream).json() as SelfEvaluationResponse[];
  return Array.isArray(body) ? body : [];
}

async function writeSelfResponses(
  teacherId: TeacherId,
  evaluationId: string,
  responses: SelfEvaluationResponse[],
) {
  await put(responsesPath(teacherId, evaluationId), JSON.stringify(responses), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function listSelfResponses(
  teacherIdValue: string,
  evaluationId: string,
) {
  if (!isTeacherId(teacherIdValue) || !evaluationId) return [];
  return readSelfResponses(teacherIdValue, evaluationId);
}

function compactKey(value?: string | number) {
  return String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

function responseOwnerKey(response: Pick<SelfEvaluationResponse, "respondent">) {
  const respondent = response.respondent;
  return [
    compactKey(respondent.grade),
    compactKey(respondent.className),
    compactKey(respondent.name),
    compactKey(respondent.team),
  ].join("|");
}

function answersForQuestions(
  config: SelfEvaluationConfig,
  inputAnswers: SelfAnswer[],
) {
  return config.questions.map((question) => {
    const input = inputAnswers.find((answer) => answer.questionId === question.id);
    return normalizeQuestionAnswer(question, input);
  });
}

export async function saveSelfResponse(input: {
  config: SelfEvaluationConfig;
  submission: SelfResponseInput;
}) {
  const teacherIdValue = input.config.teacherId ?? "";
  const evaluationId = input.config.evaluationId;
  if (!isTeacherId(teacherIdValue) || !evaluationId) {
    throw new Error("자기평가 링크 정보를 확인해 주세요.");
  }
  const respondent = {
    grade: input.submission.respondent.grade?.trim() ?? "",
    className: input.submission.respondent.className?.trim() ?? "",
    name: input.submission.respondent.name?.trim() ?? "",
    team: input.submission.respondent.team?.trim() || undefined,
  };
  if (!respondent.grade || !respondent.className || !respondent.name) {
    throw new Error("학년, 반, 이름을 모두 입력해 주세요.");
  }

  const response: SelfEvaluationResponse = {
    id: crypto.randomUUID(),
    teacherId: teacherIdValue,
    evaluationId,
    evaluationTitle: input.config.title,
    respondent,
    answers: answersForQuestions(input.config, input.submission.answers ?? []),
    createdAt: new Date().toISOString(),
  };
  const existing = await readSelfResponses(teacherIdValue, evaluationId);
  const key = responseOwnerKey(response);
  await writeSelfResponses(
    teacherIdValue,
    evaluationId,
    [response, ...existing.filter((item) => responseOwnerKey(item) !== key)],
  );
  return response;
}
