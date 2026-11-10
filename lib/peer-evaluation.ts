import type { TeacherId } from "./teacher-evaluations";
import {
  maxScoreFromLevels,
  normalizeRubricLevels,
  type EvaluationQuestionType,
  type RubricLevel,
} from "./rubric-levels";

export type PeerQuestionType = EvaluationQuestionType;
export type PeerEvaluationMode = "individual" | "team";

export type PeerQuestion = {
  id: string;
  prompt: string;
  type: PeerQuestionType;
  maxScore: number;
  required: boolean;
  levels?: RubricLevel[];
};

export type PeerEvaluationConfig = {
  title: string;
  description: string;
  mode: PeerEvaluationMode;
  teamCount: number;
  questions: PeerQuestion[];
  teacherId?: string;
  evaluationId?: string;
};

export type PeerAnswer = {
  questionId: string;
  value: number | string;
  levelId?: string;
};

export type PeerEvaluationResponse = {
  id: string;
  teacherId: TeacherId;
  evaluationId: string;
  evaluationTitle: string;
  mode: PeerEvaluationMode;
  respondent: {
    grade: string;
    className: string;
    name: string;
    teamNumber?: number;
  };
  target: {
    name?: string;
    teamNumber?: number;
  };
  answers: PeerAnswer[];
  createdAt: string;
};

export const defaultPeerQuestions: PeerQuestion[] = [
  {
    id: "participation",
    prompt: "친구가 활동에 성실하게 참여했나요?",
    type: "score",
    maxScore: 5,
    required: true,
  },
  {
    id: "collaboration",
    prompt: "친구가 모둠이나 반 친구들과 협력한 모습을 적어 주세요.",
    type: "text",
    maxScore: 5,
    required: true,
  },
];

export const defaultPeerEvaluationConfig: PeerEvaluationConfig = {
  title: "동료평가",
  description: "같은 반 친구의 활동 과정을 돌아보고 구체적으로 평가해 주세요.",
  mode: "individual",
  teamCount: 6,
  questions: defaultPeerQuestions,
};

export function createPeerQuestion(): PeerQuestion {
  return {
    id: crypto.randomUUID(),
    prompt: "",
    type: "score",
    maxScore: 5,
    required: true,
  };
}

function normalizeQuestion(value: Partial<PeerQuestion>, index: number): PeerQuestion {
  const type: PeerQuestionType = value.type === "text"
    ? "text"
    : value.type === "level"
      ? "level"
      : "score";
  const maxScore = Number(value.maxScore);
  const normalizedMaxScore = Number.isFinite(maxScore)
    ? Math.max(1, Math.min(100, Math.round(maxScore)))
    : 5;
  const levels = type === "level"
    ? normalizeRubricLevels(value.levels, normalizedMaxScore)
    : undefined;
  return {
    id: value.id?.trim() || `question-${index + 1}`,
    prompt: value.prompt?.trim() ?? "",
    type,
    maxScore: type === "level" ? maxScoreFromLevels(levels, normalizedMaxScore) : normalizedMaxScore,
    required: value.required !== false,
    ...(levels ? { levels } : {}),
  };
}

export function normalizePeerEvaluationConfig(
  value?: Partial<PeerEvaluationConfig>,
): PeerEvaluationConfig {
  const mode = value?.mode === "team" ? "team" : "individual";
  const teamCount = Number(value?.teamCount);
  const questions = Array.isArray(value?.questions)
    ? value.questions.map(normalizeQuestion).filter((question) => question.prompt)
    : [];

  return {
    title: value?.title?.trim() || defaultPeerEvaluationConfig.title,
    description: value?.description?.trim() || defaultPeerEvaluationConfig.description,
    mode,
    teamCount: Number.isFinite(teamCount)
      ? Math.max(2, Math.min(20, Math.round(teamCount)))
      : defaultPeerEvaluationConfig.teamCount,
    questions: questions.length > 0 ? questions : defaultPeerQuestions,
    teacherId: value?.teacherId?.trim() || undefined,
    evaluationId: value?.evaluationId?.trim() || undefined,
  };
}

export function validatePeerEvaluationConfig(config: PeerEvaluationConfig) {
  if (!config.title.trim()) return "평가 제목을 입력해 주세요.";
  if (config.mode === "team" && config.teamCount < 2) {
    return "모둠 수는 2개 이상이어야 합니다.";
  }
  if (config.questions.length === 0) return "질문을 하나 이상 추가해 주세요.";
  if (config.questions.some((question) => !question.prompt.trim())) {
    return "비어 있는 질문을 확인해 주세요.";
  }
  if (config.questions.some((question) => (
    question.type === "level"
    && (!question.levels || question.levels.length < 2)
  ))) {
    return "상중하 선택형 질문의 선택지를 확인해 주세요.";
  }
  return "";
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "동료평가 정보를 불러오지 못했습니다.");
  }
  return data as T;
}

export async function loadPeerResponses(
  teacherId: TeacherId,
  evaluationId: string,
) {
  const response = await fetch(
    `/api/teachers/${teacherId}/peer-responses?evaluation=${encodeURIComponent(evaluationId)}`,
    { cache: "no-store" },
  );
  const data = await readJson<{ responses: PeerEvaluationResponse[] }>(response);
  return data.responses;
}
