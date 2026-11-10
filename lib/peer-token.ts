import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import {
  normalizePeerEvaluationConfig,
  type PeerEvaluationConfig,
} from "./peer-evaluation";

function getKey() {
  const secret = process.env.CLASS_CONFIG_SECRET || process.env.TEACHER_STORAGE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("CLASS_CONFIG_SECRET or TEACHER_STORAGE_SECRET is not configured.");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptPeerClassConfig(config: PeerEvaluationConfig) {
  const normalized = normalizePeerEvaluationConfig(config);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(normalized), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptPeerClassConfig(token: string): PeerEvaluationConfig {
  const payload = Buffer.from(token, "base64url");
  if (payload.length < 29) throw new Error("Invalid peer class token.");

  const decipher = createDecipheriv("aes-256-gcm", getKey(), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  const config = JSON.parse(
    Buffer.concat([
      decipher.update(payload.subarray(28)),
      decipher.final(),
    ]).toString("utf8"),
  ) as PeerEvaluationConfig;
  const normalized = normalizePeerEvaluationConfig(config);

  if (!normalized.teacherId || !normalized.evaluationId || normalized.questions.length === 0) {
    throw new Error("Incomplete peer class config.");
  }
  return normalized;
}
