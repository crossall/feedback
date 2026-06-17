import type { ClassConfig } from "./class-config";

export const teacherIds = ["4523", "6556", "7244"] as const;

export type TeacherId = (typeof teacherIds)[number];
export type EvaluationType = "pdf" | "docs";

export type SavedEvaluation = {
  id: string;
  teacherId: TeacherId;
  type: EvaluationType;
  config: ClassConfig;
  hasApiKey: boolean;
  hasApiKeys?: {
    openai: boolean;
    anthropic: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export function isTeacherId(value: string): value is TeacherId {
  return teacherIds.includes(value as TeacherId);
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "평가 저장소를 불러오지 못했습니다.");
  }
  return data as T;
}

export async function loadEvaluations(teacherId: TeacherId) {
  const response = await fetch(`/api/teachers/${teacherId}/evaluations`, {
    cache: "no-store",
  });
  const data = await readJson<{ evaluations: SavedEvaluation[] }>(response);
  return data.evaluations;
}

export async function loadEvaluation(teacherId: TeacherId, evaluationId: string) {
  const evaluations = await loadEvaluations(teacherId);
  return evaluations.find(({ id }) => id === evaluationId);
}

export async function saveEvaluation(
  teacherId: TeacherId,
  type: EvaluationType,
  config: ClassConfig,
  evaluationId?: string,
) {
  const response = await fetch(`/api/teachers/${teacherId}/evaluations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, config, evaluationId }),
  });
  const data = await readJson<{ evaluation: SavedEvaluation }>(response);
  return data.evaluation;
}

export async function deleteEvaluation(teacherId: TeacherId, evaluationId: string) {
  const response = await fetch(`/api/teachers/${teacherId}/evaluations`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evaluationId }),
  });
  await readJson<{ success: true }>(response);
}

export async function loadTeacherApiKeyStatus(teacherId: TeacherId) {
  const response = await fetch(`/api/teachers/${teacherId}/api-keys`, {
    cache: "no-store",
  });
  const data = await readJson<{
    hasApiKeys: { openai: boolean; anthropic: boolean };
  }>(response);
  return data.hasApiKeys;
}

export async function saveTeacherApiKeySettings(
  teacherId: TeacherId,
  apiKeys: { openai?: string; anthropic?: string },
) {
  const response = await fetch(`/api/teachers/${teacherId}/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(apiKeys),
  });
  const data = await readJson<{
    hasApiKeys: { openai: boolean; anthropic: boolean };
  }>(response);
  return data.hasApiKeys;
}
