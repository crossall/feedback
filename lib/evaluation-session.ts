import type { ClassConfig } from "./class-config";
import { normalizeOutputOptions, providerFromModel } from "./class-config";
import type {
  PeerEvaluationConfig,
  PeerEvaluationMode,
  PeerQuestion,
} from "./peer-evaluation";
import {
  defaultPeerQuestions,
  normalizePeerEvaluationConfig,
} from "./peer-evaluation";
import type { Evaluation } from "./evaluation-result";
import {
  maxScoreFromLevels,
  normalizeRubricLevels,
  type EvaluationQuestionType,
  type RubricLevel,
} from "./rubric-levels";

export type EvaluationSessionStepKind = "pdf" | "docs" | "peer" | "self" | "reflection";

export type SessionBaseStep = {
  id: string;
  kind: EvaluationSessionStepKind;
  title: string;
  required: boolean;
  sourceEvaluationId?: string;
};

export type SessionAiStep = SessionBaseStep & {
  kind: "pdf" | "docs";
  config: ClassConfig;
};

export type SessionPeerStep = SessionBaseStep & {
  kind: "peer";
  config: PeerEvaluationConfig;
};

export type SessionSelfQuestionType = EvaluationQuestionType;

export type SessionSelfQuestion = {
  id: string;
  prompt: string;
  type: SessionSelfQuestionType;
  maxScore: number;
  required: boolean;
  levels?: RubricLevel[];
};

export type SessionSelfStep = SessionBaseStep & {
  kind: "self";
  questions: SessionSelfQuestion[];
};

export type SessionReflectionStep = SessionBaseStep & {
  kind: "reflection";
  questions: string[];
};

export type EvaluationSessionStep =
  | SessionAiStep
  | SessionPeerStep
  | SessionSelfStep
  | SessionReflectionStep;

export type EvaluationSessionConfig = {
  title: string;
  description: string;
  teacherId?: string;
  evaluationId?: string;
  studentResultSharing: {
    enabled: boolean;
    anonymizeRespondents: boolean;
    minPeerResponses: number;
  };
  steps: EvaluationSessionStep[];
};

export type SessionRespondent = {
  grade: string;
  className: string;
  name: string;
  team?: string;
};

export type SessionResponsePayload =
  | {
      type: "ai";
      inputKind: "pdf" | "docs";
      sourceLabel: string;
      evaluation: Evaluation;
    }
  | {
      type: "peer";
      mode: PeerEvaluationMode;
      target: {
        name?: string;
        teamNumber?: number;
      };
      answers: {
        questionId: string;
        value: string | number;
        levelId?: string;
      }[];
    }
  | {
      type: "self";
      answers: {
        questionId: string;
        value: string | number;
        levelId?: string;
      }[];
    }
  | {
      type: "reflection";
      answers: {
        question: string;
        answer: string;
      }[];
    };

export type EvaluationSessionResponse = {
  id: string;
  teacherId: string;
  sessionId: string;
  sessionTitle: string;
  stepId: string;
  stepKind: EvaluationSessionStepKind;
  stepTitle: string;
  respondent: SessionRespondent;
  payload: SessionResponsePayload;
  createdAt: string;
};

export const defaultSelfQuestions: SessionSelfQuestion[] = [
  {
    id: "effort",
    prompt: "이번 활동에서 내가 맡은 역할을 성실하게 해냈나요?",
    type: "score",
    maxScore: 5,
    required: true,
  },
  {
    id: "growth",
    prompt: "이번 활동에서 내가 잘한 점과 다음에 더 해보고 싶은 점을 적어 주세요.",
    type: "text",
    maxScore: 5,
    required: true,
  },
];

export const defaultReflectionQuestions = [
  "이번 프로젝트에서 우리 모둠이 가장 잘한 점은 무엇인가요?",
  "평가 결과를 보고 새롭게 알게 된 점은 무엇인가요?",
  "다음 프로젝트에서 바꾸거나 더 시도해 보고 싶은 점은 무엇인가요?",
];

export const defaultEvaluationSessionConfig: EvaluationSessionConfig = {
  title: "프로젝트 통합 평가",
  description: "여러 평가를 순서대로 진행하고 마지막에 통합 결과를 확인합니다.",
  studentResultSharing: {
    enabled: false,
    anonymizeRespondents: true,
    minPeerResponses: 2,
  },
  steps: [],
};

export function createSessionStepId() {
  return `step-${crypto.randomUUID()}`;
}

function normalizeAiConfig(config: Partial<ClassConfig> | undefined): ClassConfig {
  const model = config?.model?.trim() || "gpt-5.5";
  const provider = providerFromModel(model, config?.provider);
  return {
    apiKey: "",
    apiKeys: { openai: "", anthropic: "" },
    provider,
    model,
    classTitle: config?.classTitle?.trim() || "AI 평가",
    assignment: config?.assignment?.trim() || "",
    rubric: config?.rubric?.trim() || "",
    instruction: config?.instruction?.trim() || "",
    outputOptions: normalizeOutputOptions(config?.outputOptions),
    teacherId: config?.teacherId?.trim() || undefined,
  };
}

function normalizeSelfQuestion(
  value: Partial<SessionSelfQuestion>,
  index: number,
): SessionSelfQuestion {
  const maxScore = Number(value.maxScore);
  const type: SessionSelfQuestionType = value.type === "text"
    ? "text"
    : value.type === "level"
      ? "level"
      : "score";
  const normalizedMaxScore = Number.isFinite(maxScore)
    ? Math.max(1, Math.min(100, Math.round(maxScore)))
    : 5;
  const levels = type === "level"
    ? normalizeRubricLevels(value.levels, normalizedMaxScore)
    : undefined;
  return {
    id: value.id?.trim() || `self-${index + 1}`,
    prompt: value.prompt?.trim() || defaultSelfQuestions[index]?.prompt || "",
    type,
    maxScore: type === "level" ? maxScoreFromLevels(levels, normalizedMaxScore) : normalizedMaxScore,
    required: value.required !== false,
    ...(levels ? { levels } : {}),
  };
}

function normalizeStep(value: Partial<EvaluationSessionStep>, index: number) {
  const kind = value.kind;
  const base = {
    id: value.id?.trim() || `step-${index + 1}`,
    title: value.title?.trim() || "평가 단계",
    required: value.required !== false,
    sourceEvaluationId: value.sourceEvaluationId?.trim() || undefined,
  };

  if (kind === "pdf" || kind === "docs") {
    return {
      ...base,
      kind,
      title: value.title?.trim() || (kind === "pdf" ? "PDF 결과물 평가" : "Google Docs 결과물 평가"),
      config: normalizeAiConfig((value as Partial<SessionAiStep>).config),
    } satisfies SessionAiStep;
  }

  if (kind === "peer") {
    const config = normalizePeerEvaluationConfig(
      (value as Partial<SessionPeerStep>).config,
    );
    return {
      ...base,
      kind,
      title: value.title?.trim() || config.title || "동료평가",
      config,
    } satisfies SessionPeerStep;
  }

  if (kind === "reflection") {
    const questions = (value as Partial<SessionReflectionStep>).questions;
    return {
      ...base,
      kind,
      title: value.title?.trim() || "프로젝트 성찰",
      questions: Array.isArray(questions)
        ? questions.map((question) => question.trim()).filter(Boolean)
        : defaultReflectionQuestions,
    } satisfies SessionReflectionStep;
  }

  const questions = (value as Partial<SessionSelfStep>).questions;
  return {
    ...base,
    kind: "self",
    title: value.title?.trim() || "자기평가",
    questions: Array.isArray(questions)
      ? questions.map(normalizeSelfQuestion).filter((question) => question.prompt)
      : defaultSelfQuestions,
  } satisfies SessionSelfStep;
}

export function normalizeEvaluationSessionConfig(
  value?: Partial<EvaluationSessionConfig>,
): EvaluationSessionConfig {
  const steps = Array.isArray(value?.steps)
    ? value.steps.map(normalizeStep)
    : [];
  const minPeerResponses = Number(value?.studentResultSharing?.minPeerResponses);

  return {
    title: value?.title?.trim() || defaultEvaluationSessionConfig.title,
    description: value?.description?.trim() || defaultEvaluationSessionConfig.description,
    teacherId: value?.teacherId?.trim() || undefined,
    evaluationId: value?.evaluationId?.trim() || undefined,
    studentResultSharing: {
      enabled: value?.studentResultSharing?.enabled === true,
      anonymizeRespondents: value?.studentResultSharing?.anonymizeRespondents !== false,
      minPeerResponses: Number.isFinite(minPeerResponses)
        ? Math.max(1, Math.min(10, Math.round(minPeerResponses)))
        : defaultEvaluationSessionConfig.studentResultSharing.minPeerResponses,
    },
    steps,
  };
}

export function validateEvaluationSessionConfig(config: EvaluationSessionConfig) {
  if (!config.title.trim()) return "세션 제목을 입력해 주세요.";
  if (config.steps.length === 0) return "세션에 평가 단계를 하나 이상 추가해 주세요.";
  for (const step of config.steps) {
    if (!step.title.trim()) return "비어 있는 평가 단계 제목을 확인해 주세요.";
    if ((step.kind === "pdf" || step.kind === "docs") && (
      !step.config.assignment.trim() || !step.config.rubric.trim()
    )) {
      return `${step.title}의 과제 설명과 루브릭을 확인해 주세요.`;
    }
    if (step.kind === "peer" && step.config.questions.length === 0) {
      return `${step.title}의 동료평가 질문을 확인해 주세요.`;
    }
    if (step.kind === "self" && step.questions.length === 0) {
      return `${step.title}의 자기평가 질문을 확인해 주세요.`;
    }
    if (step.kind === "self" && step.questions.some((question) => (
      question.type === "level"
      && (!question.levels || question.levels.length < 2)
    ))) {
      return `${step.title}의 상중하 선택지를 확인해 주세요.`;
    }
    if (step.kind === "reflection" && step.questions.length === 0) {
      return `${step.title}의 성찰 질문을 확인해 주세요.`;
    }
  }
  return "";
}

export function sessionStepLabel(kind: EvaluationSessionStepKind) {
  if (kind === "pdf") return "PDF";
  if (kind === "docs") return "DOCS";
  if (kind === "peer") return "PEER";
  if (kind === "self") return "SELF";
  return "REFLECT";
}

export function scoreSessionResponse(response: EvaluationSessionResponse) {
  if (response.payload.type === "ai") {
    return {
      score: response.payload.evaluation.totalScore,
      maxScore: response.payload.evaluation.maxScore,
    };
  }
  if (response.payload.type === "peer") {
    const stepQuestions = response.payload.answers
      .filter((answer) => typeof answer.value === "number");
    return {
      score: stepQuestions.reduce((sum, answer) => sum + Number(answer.value), 0),
      maxScore: stepQuestions.length,
    };
  }
  if (response.payload.type === "self") {
    const values = response.payload.answers
      .filter((answer) => typeof answer.value === "number");
    return {
      score: values.reduce((sum, answer) => sum + Number(answer.value), 0),
      maxScore: values.length,
    };
  }
  return { score: 0, maxScore: 0 };
}

export function peerQuestionsForSession(step: SessionPeerStep): PeerQuestion[] {
  return step.config.questions.length > 0 ? step.config.questions : defaultPeerQuestions;
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "세션 정보를 불러오지 못했습니다.");
  }
  return data as T;
}

export async function loadSessionResponses(
  teacherId: string,
  sessionId: string,
) {
  const response = await fetch(
    `/api/teachers/${teacherId}/session-responses?session=${encodeURIComponent(sessionId)}`,
    { cache: "no-store" },
  );
  const data = await readJson<{ responses: EvaluationSessionResponse[] }>(response);
  return data.responses;
}
