import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { get, put } from "@vercel/blob";
import {
  defaultOutputOptions,
  normalizeOutputOptions,
  type ClassConfig,
} from "@/lib/class-config";
import {
  isTeacherId,
  type EvaluationType,
  type SavedEvaluation,
  type TeacherId,
} from "@/lib/teacher-evaluations";

type StoredEvaluation = {
  id: string;
  teacherId: TeacherId;
  type: EvaluationType;
  config: Omit<ClassConfig, "apiKey">;
  encryptedApiKey: string;
  createdAt: string;
  updatedAt: string;
};

function getEncryptionKey() {
  const secret = process.env.TEACHER_STORAGE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("TEACHER_STORAGE_SECRET is not configured.");
  }
  return createHash("sha256").update(secret).digest();
}

function encryptApiKey(apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function decryptApiKey(payload: string) {
  if (!payload) return "";
  const value = Buffer.from(payload, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), value.subarray(0, 12));
  decipher.setAuthTag(value.subarray(12, 28));
  return Buffer.concat([
    decipher.update(value.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}

function teacherPath(teacherId: TeacherId) {
  return `teachers/${teacherId}.json`;
}

async function readStoredEvaluations(teacherId: TeacherId): Promise<StoredEvaluation[]> {
  const result = await get(teacherPath(teacherId), {
    access: "private",
    useCache: false,
  });
  if (!result) return [];
  const body = await new Response(result.stream).json() as StoredEvaluation[];
  return Array.isArray(body) ? body : [];
}

async function writeStoredEvaluations(
  teacherId: TeacherId,
  evaluations: StoredEvaluation[],
) {
  await put(teacherPath(teacherId), JSON.stringify(evaluations), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

function toPublicEvaluation(evaluation: StoredEvaluation): SavedEvaluation {
  return {
    id: evaluation.id,
    teacherId: evaluation.teacherId,
    type: evaluation.type,
    config: {
      ...evaluation.config,
      apiKey: "",
      outputOptions: {
        ...defaultOutputOptions,
        ...evaluation.config.outputOptions,
      },
    },
    hasApiKey: Boolean(evaluation.encryptedApiKey),
    createdAt: evaluation.createdAt,
    updatedAt: evaluation.updatedAt,
  };
}

export async function listTeacherEvaluations(teacherId: TeacherId) {
  const evaluations = await readStoredEvaluations(teacherId);
  return evaluations
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(toPublicEvaluation);
}

export async function saveTeacherEvaluation(input: {
  teacherId: TeacherId;
  type: EvaluationType;
  config: ClassConfig;
  evaluationId?: string;
}) {
  const evaluations = await readStoredEvaluations(input.teacherId);
  const existing = input.evaluationId
    ? evaluations.find(({ id }) => id === input.evaluationId)
    : undefined;
  const now = new Date().toISOString();
  const apiKey = input.config.apiKey.trim();
  const saved: StoredEvaluation = {
    id: existing?.id ?? crypto.randomUUID(),
    teacherId: input.teacherId,
    type: input.type,
    config: {
      model: input.config.model.trim() || "gpt-5.5",
      classTitle: input.config.classTitle.trim(),
      assignment: input.config.assignment.trim(),
      rubric: input.config.rubric.trim(),
      instruction: input.config.instruction.trim(),
      teacherId: input.teacherId,
      outputOptions: {
        ...normalizeOutputOptions(input.config.outputOptions),
        appendToGoogleDoc: input.type === "docs"
          && input.config.outputOptions?.appendToGoogleDoc === true,
      },
    },
    encryptedApiKey: apiKey
      ? encryptApiKey(apiKey)
      : existing?.encryptedApiKey ?? "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await writeStoredEvaluations(
    input.teacherId,
    [saved, ...evaluations.filter(({ id }) => id !== saved.id)],
  );
  return toPublicEvaluation(saved);
}

export async function deleteTeacherEvaluation(
  teacherId: TeacherId,
  evaluationId: string,
) {
  const evaluations = await readStoredEvaluations(teacherId);
  await writeStoredEvaluations(
    teacherId,
    evaluations.filter(({ id }) => id !== evaluationId),
  );
}

export async function getStoredApiKey(teacherIdValue: string, evaluationId: string) {
  if (!isTeacherId(teacherIdValue) || !evaluationId) return "";
  const evaluations = await readStoredEvaluations(teacherIdValue);
  const evaluation = evaluations.find(({ id }) => id === evaluationId);
  return evaluation ? decryptApiKey(evaluation.encryptedApiKey) : "";
}
