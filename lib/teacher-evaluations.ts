import type { ClassConfig } from "./class-config";
import type { EvaluationSessionConfig } from "./evaluation-session";
import type { PeerEvaluationConfig } from "./peer-evaluation";

export type TeacherId = string;
export type EvaluationType = "pdf" | "docs" | "peer" | "session";

export type SavedAiEvaluation = {
  id: string;
  teacherId: TeacherId;
  type: "pdf" | "docs";
  config: ClassConfig;
  hasApiKey: boolean;
  hasApiKeys?: {
    openai: boolean;
    anthropic: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type SavedPeerEvaluation = {
  id: string;
  teacherId: TeacherId;
  type: "peer";
  config: PeerEvaluationConfig;
  hasApiKey: false;
  hasApiKeys?: {
    openai: false;
    anthropic: false;
  };
  createdAt: string;
  updatedAt: string;
};

export type SavedSessionEvaluation = {
  id: string;
  teacherId: TeacherId;
  type: "session";
  config: EvaluationSessionConfig;
  hasApiKey: false;
  hasApiKeys?: {
    openai: false;
    anthropic: false;
  };
  createdAt: string;
  updatedAt: string;
};

export type SavedEvaluation = SavedAiEvaluation | SavedPeerEvaluation | SavedSessionEvaluation;

export function isTeacherId(value: string): value is TeacherId {
  return /^\d{4}$/.test(value);
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
  config: ClassConfig | PeerEvaluationConfig | EvaluationSessionConfig,
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
