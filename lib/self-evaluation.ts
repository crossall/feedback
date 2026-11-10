import type { TeacherId } from "./teacher-evaluations";
import {
  maxScoreFromLevels,
  normalizeRubricLevels,
  type EvaluationQuestionType,
  type RubricLevel,
} from "./rubric-levels";

export type SelfQuestionType = EvaluationQuestionType;

export type SelfQuestion = {
  id: string;
  prompt: string;
  type: SelfQuestionType;
  maxScore: number;
  required: boolean;
  levels?: RubricLevel[];
};

export type SelfEvaluationConfig = {
  title: string;
  description: string;
  questions: SelfQuestion[];
  teacherId?: string;
  evaluationId?: string;
};

export type SelfAnswer = {
  questionId: string;
  value: number | string;
  levelId?: string;
};

export type SelfEvaluationResponse = {
  id: string;
  teacherId: TeacherId;
  evaluationId: string;
  evaluationTitle: string;
  respondent: {
    grade: string;
    className: string;
    name: string;
    team?: string;
  };
  answers: SelfAnswer[];
  createdAt: string;
};

export const defaultSelfEvaluationQuestions: SelfQuestion[] = [
  {
    id: "effort",
    prompt: "이번 활동에서 내가 맡은 역할을 성실하게 해냈나요?",
    type: "score",
    maxScore: 5,
    required: true,
  },
  {
    id: "collaboration",
    prompt: "모둠 활동에서 내가 잘한 점을 구체적으로 적어 주세요.",
    type: "text",
    maxScore: 5,
    required: true,
  },
  {
    id: "growth",
    prompt: "다음 활동에서 더 해보고 싶은 점이나 고치고 싶은 점은 무엇인가요?",
    type: "text",
    maxScore: 5,
    required: true,
  },
];

export const defaultSelfEvaluationConfig: SelfEvaluationConfig = {
  title: "자기평가",
  description: "이번 활동에서 내가 한 역할과 배운 점을 스스로 돌아봅니다.",
  questions: defaultSelfEvaluationQuestions,
};

export function createSelfQuestion(): SelfQuestion {
  return {
    id: crypto.randomUUID(),
    prompt: "",
    type: "score",
    maxScore: 5,
    required: true,
  };
}

function normalizeQuestion(value: Partial<SelfQuestion>, index: number): SelfQuestion {
  const type: SelfQuestionType = value.type === "text"
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

export function normalizeSelfEvaluationConfig(
  value?: Partial<SelfEvaluationConfig>,
): SelfEvaluationConfig {
  const questions = Array.isArray(value?.questions)
    ? value.questions.map(normalizeQuestion).filter((question) => question.prompt)
    : [];

  return {
    title: value?.title?.trim() || defaultSelfEvaluationConfig.title,
    description: value?.description?.trim() || defaultSelfEvaluationConfig.description,
    questions: questions.length > 0 ? questions : defaultSelfEvaluationQuestions,
    teacherId: value?.teacherId?.trim() || undefined,
    evaluationId: value?.evaluationId?.trim() || undefined,
  };
}

export function validateSelfEvaluationConfig(config: SelfEvaluationConfig) {
  if (!config.title.trim()) return "자기평가 제목을 입력해 주세요.";
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
    throw new Error(data.error || "자기평가 정보를 불러오지 못했습니다.");
  }
  return data as T;
}

export async function loadSelfResponses(
  teacherId: TeacherId,
  evaluationId: string,
) {
  const response = await fetch(
    `/api/teachers/${teacherId}/self-responses?evaluation=${encodeURIComponent(evaluationId)}`,
    { cache: "no-store" },
  );
  const data = await readJson<{ responses: SelfEvaluationResponse[] }>(response);
  return data.responses;
}
