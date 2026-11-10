import "server-only";

import { get, put } from "@vercel/blob";
import { isTeacherId, type TeacherId } from "@/lib/teacher-evaluations";
import {
  type PeerAnswer,
  type PeerEvaluationConfig,
  type PeerEvaluationResponse,
} from "@/lib/peer-evaluation";
import { normalizeQuestionAnswer } from "@/lib/rubric-levels";

type PeerResponseInput = {
  respondent: {
    grade?: string;
    className?: string;
    name?: string;
    teamNumber?: number;
  };
  target: {
    name?: string;
    teamNumber?: number;
  };
  answers?: PeerAnswer[];
};

function responsesPath(teacherId: TeacherId, evaluationId: string) {
  return `peer-responses/${teacherId}/${evaluationId}.json`;
}

async function readPeerResponses(
  teacherId: TeacherId,
  evaluationId: string,
): Promise<PeerEvaluationResponse[]> {
  const result = await get(responsesPath(teacherId, evaluationId), {
    access: "private",
    useCache: false,
  });
  if (!result) return [];
  const body = await new Response(result.stream).json() as PeerEvaluationResponse[];
  return Array.isArray(body) ? body : [];
}

async function writePeerResponses(
  teacherId: TeacherId,
  evaluationId: string,
  responses: PeerEvaluationResponse[],
) {
  await put(responsesPath(teacherId, evaluationId), JSON.stringify(responses), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function listPeerResponses(
  teacherIdValue: string,
  evaluationId: string,
) {
  if (!isTeacherId(teacherIdValue) || !evaluationId) return [];
  return readPeerResponses(teacherIdValue, evaluationId);
}

function answerForQuestion(
  config: PeerEvaluationConfig,
  inputAnswers: PeerAnswer[],
) {
  return config.questions.map((question) => {
    const input = inputAnswers.find((answer) => answer.questionId === question.id);
    return normalizeQuestionAnswer(question, input);
  });
}

function compactKey(value?: string | number) {
  return String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

function responseOwnerKey(response: Pick<PeerEvaluationResponse, "respondent" | "target" | "mode">) {
  const respondent = response.respondent;
  const target = response.target;
  const targetKey = response.mode === "team"
    ? `team:${target.teamNumber ?? ""}`
    : `student:${compactKey(target.name)}`;
  return [
    compactKey(respondent.grade),
    compactKey(respondent.className),
    compactKey(respondent.name),
    respondent.teamNumber ?? "",
    targetKey,
  ].join("|");
}

function createPeerResponse(input: {
  config: PeerEvaluationConfig;
  teacherId: TeacherId;
  evaluationId: string;
  submission: PeerResponseInput;
}) {
  const respondent = {
    grade: input.submission.respondent.grade?.trim() ?? "",
    className: input.submission.respondent.className?.trim() ?? "",
    name: input.submission.respondent.name?.trim() ?? "",
    teamNumber: input.submission.respondent.teamNumber,
  };
  if (!respondent.grade || !respondent.className || !respondent.name) {
    throw new Error("학년, 반, 내 이름을 모두 입력해 주세요.");
  }

  const target = {
    name: input.submission.target.name?.trim() || undefined,
    teamNumber: input.submission.target.teamNumber,
  };
  if (input.config.mode === "team") {
    if (!respondent.teamNumber || !target.teamNumber) {
      throw new Error("내 모둠과 평가할 모둠을 모두 선택해 주세요.");
    }
    if (respondent.teamNumber === target.teamNumber) {
      throw new Error("자기 모둠은 평가 대상에서 제외해 주세요.");
    }
  } else if (!target.name) {
    throw new Error("평가할 친구 이름을 입력해 주세요.");
  }

  return {
    id: crypto.randomUUID(),
    teacherId: input.teacherId,
    evaluationId: input.evaluationId,
    evaluationTitle: input.config.title,
    mode: input.config.mode,
    respondent,
    target,
    answers: answerForQuestion(input.config, input.submission.answers ?? []),
    createdAt: new Date().toISOString(),
  };
}

export async function savePeerResponses(input: {
  config: PeerEvaluationConfig;
  submissions: PeerResponseInput[];
}) {
  const teacherIdValue = input.config.teacherId ?? "";
  const evaluationId = input.config.evaluationId;
  if (!isTeacherId(teacherIdValue) || !evaluationId) {
    throw new Error("동료평가 링크 정보를 확인해 주세요.");
  }
  const teacherId = teacherIdValue;
  if (input.submissions.length === 0) {
    throw new Error("평가할 대상을 하나 이상 추가해 주세요.");
  }

  const responses = input.submissions.map((submission) => createPeerResponse({
    config: input.config,
    teacherId,
    evaluationId,
    submission,
  }));
  const requestedKeys = new Set<string>();
  for (const response of responses) {
    const key = responseOwnerKey(response);
    if (requestedKeys.has(key)) {
      throw new Error("같은 대상을 중복해서 평가할 수 없습니다.");
    }
    requestedKeys.add(key);
  }

  const existing = await readPeerResponses(teacherId, evaluationId);
  const existingKeys = new Set(existing.map(responseOwnerKey));
  if (responses.some((response) => existingKeys.has(responseOwnerKey(response)))) {
    throw new Error("이미 평가한 대상이 포함되어 있습니다.");
  }

  await writePeerResponses(teacherId, evaluationId, [...responses, ...existing]);
  return responses;
}

export async function savePeerResponse(input: {
  config: PeerEvaluationConfig;
  respondent: PeerResponseInput["respondent"];
  target: PeerResponseInput["target"];
  answers?: PeerAnswer[];
}) {
  const responses = await savePeerResponses({
    config: input.config,
    submissions: [{
      respondent: input.respondent,
      target: input.target,
      answers: input.answers,
    }],
  });
  return responses[0];
}
