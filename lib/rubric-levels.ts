export type EvaluationQuestionType = "score" | "text" | "level";

export type RubricLevel = {
  id: string;
  label: string;
  score: number;
  description: string;
};

export type ScoredQuestion = {
  id: string;
  type: EvaluationQuestionType;
  maxScore: number;
  required: boolean;
  levels?: RubricLevel[];
};

export type QuestionAnswer = {
  questionId: string;
  value: number | string;
  levelId?: string;
};

const defaultLevelSeeds = [
  { id: "high", label: "상", ratio: 1, description: "기준을 충분히 잘 충족했습니다." },
  { id: "middle", label: "중", ratio: 0.8, description: "기준을 대체로 충족했습니다." },
  { id: "low", label: "하", ratio: 0.6, description: "기준을 일부 충족했습니다." },
] as const;

export function createDefaultRubricLevels(maxScore = 5): RubricLevel[] {
  const score = Number.isFinite(maxScore) ? Math.max(1, Math.round(maxScore)) : 5;
  return defaultLevelSeeds.map((level) => ({
    id: level.id,
    label: level.label,
    score: Math.max(1, Math.round(score * level.ratio)),
    description: level.description,
  }));
}

export function normalizeRubricLevels(
  value: Partial<RubricLevel>[] | undefined,
  maxScore = 5,
): RubricLevel[] {
  const fallback = createDefaultRubricLevels(maxScore);
  const source = Array.isArray(value) && value.length > 0 ? value : fallback;
  const normalized = source.slice(0, 6).map((level, index) => {
    const score = Number(level.score);
    const fallbackLevel = fallback[index] ?? fallback[fallback.length - 1];
    return {
      id: level.id?.trim() || fallbackLevel.id || `level-${index + 1}`,
      label: level.label?.trim() || fallbackLevel.label || `선택 ${index + 1}`,
      score: Number.isFinite(score)
        ? Math.max(0, Math.min(100, Math.round(score)))
        : fallbackLevel.score,
      description: level.description?.trim() || fallbackLevel.description,
    };
  });

  return normalized.length >= 2 ? normalized : fallback;
}

export function maxScoreFromLevels(levels?: RubricLevel[], fallback = 5) {
  const scores = levels?.map((level) => level.score).filter(Number.isFinite) ?? [];
  return scores.length > 0 ? Math.max(...scores) : fallback;
}

export function isScoredQuestion(question: { type: EvaluationQuestionType }) {
  return question.type === "score" || question.type === "level";
}

export function rubricLevelValue(
  question: Pick<ScoredQuestion, "levels">,
  levelId?: string | number,
) {
  const id = String(levelId ?? "").trim();
  return question.levels?.find((level) => level.id === id);
}

export function normalizeQuestionAnswer(
  question: ScoredQuestion,
  input?: Partial<QuestionAnswer>,
): QuestionAnswer {
  if (question.type === "text") {
    const value = String(input?.value ?? "").trim();
    if (question.required && !value) {
      throw new Error("서술형 질문의 답을 입력해 주세요.");
    }
    return { questionId: question.id, value };
  }

  if (question.type === "level") {
    const selected = rubricLevelValue(question, input?.levelId ?? input?.value);
    if (!selected) {
      if (question.required) throw new Error("상중하 선택형 질문의 답을 선택해 주세요.");
      return { questionId: question.id, value: "", levelId: "" };
    }
    return {
      questionId: question.id,
      value: selected.score,
      levelId: selected.id,
    };
  }

  if (input?.value === "" || input?.value === undefined) {
    if (question.required) throw new Error("점수형 질문의 답을 입력해 주세요.");
    return { questionId: question.id, value: "" };
  }
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    if (question.required) throw new Error("점수형 질문의 답을 입력해 주세요.");
    return { questionId: question.id, value: "" };
  }
  if (value < 0 || value > question.maxScore) {
    throw new Error(`${question.maxScore}점 이하의 점수를 입력해 주세요.`);
  }
  return { questionId: question.id, value };
}
