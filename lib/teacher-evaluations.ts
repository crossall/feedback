import type { ClassConfig } from "./class-config";

export const teacherIds = ["4523", "6556"] as const;

export type TeacherId = (typeof teacherIds)[number];
export type EvaluationType = "pdf" | "docs";

export type SavedEvaluation = {
  id: string;
  teacherId: TeacherId;
  type: EvaluationType;
  config: ClassConfig;
  createdAt: string;
  updatedAt: string;
};

const storagePrefix = "leafback-teacher-evaluations-v1";

export function isTeacherId(value: string): value is TeacherId {
  return teacherIds.includes(value as TeacherId);
}

function storageKey(teacherId: TeacherId) {
  return `${storagePrefix}:${teacherId}`;
}

export function loadEvaluations(teacherId: TeacherId): SavedEvaluation[] {
  const raw = localStorage.getItem(storageKey(teacherId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as SavedEvaluation[];
    return parsed
      .filter((evaluation) => evaluation.teacherId === teacherId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    localStorage.removeItem(storageKey(teacherId));
    return [];
  }
}

export function loadEvaluation(teacherId: TeacherId, evaluationId: string) {
  return loadEvaluations(teacherId).find(({ id }) => id === evaluationId);
}

export function saveEvaluation(
  teacherId: TeacherId,
  type: EvaluationType,
  config: ClassConfig,
  evaluationId?: string,
) {
  const evaluations = loadEvaluations(teacherId);
  const existing = evaluationId
    ? evaluations.find(({ id }) => id === evaluationId)
    : undefined;
  const now = new Date().toISOString();
  const saved: SavedEvaluation = {
    id: existing?.id ?? crypto.randomUUID(),
    teacherId,
    type,
    config,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const next = [saved, ...evaluations.filter(({ id }) => id !== saved.id)];
  localStorage.setItem(storageKey(teacherId), JSON.stringify(next));
  return saved;
}

export function deleteEvaluation(teacherId: TeacherId, evaluationId: string) {
  const next = loadEvaluations(teacherId).filter(({ id }) => id !== evaluationId);
  localStorage.setItem(storageKey(teacherId), JSON.stringify(next));
}
