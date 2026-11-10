import { createHmac, timingSafeEqual } from "crypto";
import { isTeacherId, type TeacherId } from "./teacher-evaluations";

export const TEACHER_SESSION_COOKIE = "leafback_teacher_session";
export const TEACHER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function authSecret() {
  const secret = process.env.TEACHER_STORAGE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("TEACHER_STORAGE_SECRET is not configured.");
  }
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", authSecret()).update(value).digest("base64url");
}

export function createTeacherSessionToken(teacherId: TeacherId) {
  const payload = Buffer.from(JSON.stringify({
    teacherId,
    expiresAt: Date.now() + TEACHER_SESSION_MAX_AGE_SECONDS * 1000,
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyTeacherSessionToken(token?: string) {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(actualBuffer, expectedBuffer)
  ) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      teacherId?: string;
      expiresAt?: number;
    };
    if (!parsed.teacherId || !isTeacherId(parsed.teacherId)) return null;
    if (!parsed.expiresAt || parsed.expiresAt < Date.now()) return null;
    return parsed.teacherId;
  } catch {
    return null;
  }
}
