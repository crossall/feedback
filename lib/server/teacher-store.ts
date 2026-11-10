import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { get, put } from "@vercel/blob";
import {
  defaultOutputOptions,
  defaultModelForProvider,
  normalizeOutputOptions,
  normalizeProviderApiKeys,
  providerFromModel,
  type ClassConfig,
  type ProviderApiKeys,
} from "@/lib/class-config";
import {
  isTeacherId,
  type EvaluationType,
  type SavedEvaluation,
  type TeacherId,
} from "@/lib/teacher-evaluations";
import {
  normalizeEvaluationSessionConfig,
  type EvaluationSessionConfig,
} from "@/lib/evaluation-session";
import {
  normalizePeerEvaluationConfig,
  type PeerEvaluationConfig,
} from "@/lib/peer-evaluation";

type StoredAiEvaluation = {
  id: string;
  teacherId: TeacherId;
  type: "pdf" | "docs";
  config: Omit<ClassConfig, "apiKey" | "apiKeys">;
  encryptedApiKey?: string;
  encryptedApiKeys?: Partial<ProviderApiKeys>;
  createdAt: string;
  updatedAt: string;
};

type StoredPeerEvaluation = {
  id: string;
  teacherId: TeacherId;
  type: "peer";
  config: PeerEvaluationConfig;
  createdAt: string;
  updatedAt: string;
};

type StoredSessionEvaluation = {
  id: string;
  teacherId: TeacherId;
  type: "session";
  config: EvaluationSessionConfig;
  createdAt: string;
  updatedAt: string;
};

type StoredEvaluation = StoredAiEvaluation | StoredPeerEvaluation | StoredSessionEvaluation;

type StoredTeacherApiKeys = {
  encryptedApiKeys?: Partial<ProviderApiKeys>;
  updatedAt?: string;
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

function decryptProviderApiKeys(evaluation: StoredAiEvaluation): ProviderApiKeys {
  return {
    openai: evaluation.encryptedApiKeys?.openai
      ? decryptApiKey(evaluation.encryptedApiKeys.openai)
      : evaluation.encryptedApiKey
        ? decryptApiKey(evaluation.encryptedApiKey)
        : "",
    anthropic: evaluation.encryptedApiKeys?.anthropic
      ? decryptApiKey(evaluation.encryptedApiKeys.anthropic)
      : "",
  };
}

function teacherPath(teacherId: TeacherId) {
  return `teachers/${teacherId}.json`;
}

function teacherApiKeysPath(teacherId: TeacherId) {
  return `teachers/${teacherId}-api-keys.json`;
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

async function readStoredTeacherApiKeys(teacherId: TeacherId): Promise<StoredTeacherApiKeys> {
  const result = await get(teacherApiKeysPath(teacherId), {
    access: "private",
    useCache: false,
  });
  if (!result) return {};
  const body = await new Response(result.stream).json() as StoredTeacherApiKeys;
  return body && typeof body === "object" ? body : {};
}

async function writeStoredTeacherApiKeys(
  teacherId: TeacherId,
  apiKeys: StoredTeacherApiKeys,
) {
  await put(teacherApiKeysPath(teacherId), JSON.stringify(apiKeys), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

function decryptTeacherApiKeys(stored: StoredTeacherApiKeys): ProviderApiKeys {
  return {
    openai: stored.encryptedApiKeys?.openai
      ? decryptApiKey(stored.encryptedApiKeys.openai)
      : "",
    anthropic: stored.encryptedApiKeys?.anthropic
      ? decryptApiKey(stored.encryptedApiKeys.anthropic)
      : "",
  };
}

function toPublicEvaluation(evaluation: StoredEvaluation): SavedEvaluation {
  if (evaluation.type === "session") {
    return {
      id: evaluation.id,
      teacherId: evaluation.teacherId,
      type: "session",
      config: evaluation.config,
      hasApiKey: false,
      hasApiKeys: { openai: false, anthropic: false },
      createdAt: evaluation.createdAt,
      updatedAt: evaluation.updatedAt,
    };
  }

  if (evaluation.type === "peer") {
    return {
      id: evaluation.id,
      teacherId: evaluation.teacherId,
      type: "peer",
      config: evaluation.config,
      hasApiKey: false,
      hasApiKeys: { openai: false, anthropic: false },
      createdAt: evaluation.createdAt,
      updatedAt: evaluation.updatedAt,
    };
  }

  return {
    id: evaluation.id,
    teacherId: evaluation.teacherId,
    type: evaluation.type,
    config: {
      ...evaluation.config,
      apiKey: "",
      apiKeys: { openai: "", anthropic: "" },
      provider: providerFromModel(evaluation.config.model, evaluation.config.provider),
      outputOptions: {
        ...defaultOutputOptions,
        ...evaluation.config.outputOptions,
      },
    },
    hasApiKey: Boolean(evaluation.encryptedApiKey || evaluation.encryptedApiKeys?.openai),
    hasApiKeys: {
      openai: Boolean(evaluation.encryptedApiKey || evaluation.encryptedApiKeys?.openai),
      anthropic: Boolean(evaluation.encryptedApiKeys?.anthropic),
    },
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
  config: ClassConfig | PeerEvaluationConfig | EvaluationSessionConfig;
  evaluationId?: string;
}) {
  const evaluations = await readStoredEvaluations(input.teacherId);
  const existing = input.evaluationId
    ? evaluations.find(({ id }) => id === input.evaluationId)
    : undefined;
  const now = new Date().toISOString();
  const id = existing?.id ?? crypto.randomUUID();

  if (input.type === "session") {
    const config = normalizeEvaluationSessionConfig(input.config as Partial<EvaluationSessionConfig>);
    const saved: StoredSessionEvaluation = {
      id,
      teacherId: input.teacherId,
      type: "session",
      config: {
        ...config,
        teacherId: input.teacherId,
        evaluationId: id,
      },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await writeStoredEvaluations(
      input.teacherId,
      [saved, ...evaluations.filter((evaluation) => evaluation.id !== saved.id)],
    );
    return toPublicEvaluation(saved);
  }

  if (input.type === "peer") {
    const config = normalizePeerEvaluationConfig(input.config as Partial<PeerEvaluationConfig>);
    const saved: StoredPeerEvaluation = {
      id,
      teacherId: input.teacherId,
      type: "peer",
      config: {
        ...config,
        teacherId: input.teacherId,
        evaluationId: id,
      },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await writeStoredEvaluations(
      input.teacherId,
      [saved, ...evaluations.filter((evaluation) => evaluation.id !== saved.id)],
    );
    return toPublicEvaluation(saved);
  }

  const config = input.config as ClassConfig;
  const provider = providerFromModel(config.model, config.provider);
  const apiKeys = normalizeProviderApiKeys(config);
  const existingApiKeys = existing && existing.type !== "peer"
    && existing.type !== "session"
    ? decryptProviderApiKeys(existing)
    : { openai: "", anthropic: "" };
  const savedApiKeys: ProviderApiKeys = {
    openai: apiKeys.openai || existingApiKeys.openai,
    anthropic: apiKeys.anthropic || existingApiKeys.anthropic,
  };
  const saved: StoredAiEvaluation = {
    id,
    teacherId: input.teacherId,
    type: input.type,
    config: {
      provider,
      model: config.model.trim() || defaultModelForProvider(provider),
      classTitle: config.classTitle.trim(),
      assignment: config.assignment.trim(),
      rubric: config.rubric.trim(),
      instruction: config.instruction.trim(),
      teacherId: input.teacherId,
      outputOptions: {
        ...normalizeOutputOptions(config.outputOptions),
        appendToGoogleDoc: input.type === "docs"
          && config.outputOptions?.appendToGoogleDoc === true,
      },
    },
    encryptedApiKeys: {
      openai: savedApiKeys.openai ? encryptApiKey(savedApiKeys.openai) : "",
      anthropic: savedApiKeys.anthropic ? encryptApiKey(savedApiKeys.anthropic) : "",
    },
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

export async function getStoredApiKeys(teacherIdValue: string, evaluationId: string) {
  if (!isTeacherId(teacherIdValue) || !evaluationId) {
    return { openai: "", anthropic: "" };
  }
  const evaluations = await readStoredEvaluations(teacherIdValue);
  const evaluation = evaluations.find(({ id }) => id === evaluationId);
  return evaluation && evaluation.type !== "peer" && evaluation.type !== "session"
    ? decryptProviderApiKeys(evaluation)
    : { openai: "", anthropic: "" };
}

export async function getTeacherApiKeys(teacherIdValue: string) {
  if (!isTeacherId(teacherIdValue)) {
    return { openai: "", anthropic: "" };
  }
  return decryptTeacherApiKeys(await readStoredTeacherApiKeys(teacherIdValue));
}

export async function getTeacherApiKeyStatus(teacherIdValue: string) {
  if (!isTeacherId(teacherIdValue)) {
    return { openai: false, anthropic: false };
  }
  const stored = await readStoredTeacherApiKeys(teacherIdValue);
  return {
    openai: Boolean(stored.encryptedApiKeys?.openai),
    anthropic: Boolean(stored.encryptedApiKeys?.anthropic),
  };
}

export async function saveTeacherApiKeys(
  teacherIdValue: string,
  input: Partial<ProviderApiKeys>,
) {
  if (!isTeacherId(teacherIdValue)) {
    throw new Error("등록되지 않은 교사 ID입니다.");
  }
  const existing = await readStoredTeacherApiKeys(teacherIdValue);
  const existingKeys = decryptTeacherApiKeys(existing);
  const apiKeys: ProviderApiKeys = {
    openai: input.openai?.trim() || existingKeys.openai,
    anthropic: input.anthropic?.trim() || existingKeys.anthropic,
  };
  const encryptedApiKeys: Partial<ProviderApiKeys> = {
    openai: apiKeys.openai ? encryptApiKey(apiKeys.openai) : "",
    anthropic: apiKeys.anthropic ? encryptApiKey(apiKeys.anthropic) : "",
  };
  await writeStoredTeacherApiKeys(teacherIdValue, {
    encryptedApiKeys,
    updatedAt: new Date().toISOString(),
  });
  return {
    openai: Boolean(encryptedApiKeys.openai),
    anthropic: Boolean(encryptedApiKeys.anthropic),
  };
}
