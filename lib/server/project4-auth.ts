import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

export type Project4Access = {
  role: "teacher" | "student" | "junior";
  classId?: string;
  groupId?: string;
  studentId?: string;
  name?: string;
  evaluatorClass?: string;
  exp: number;
};

function secret() {
  const value = process.env.PROJECT4_SECRET || process.env.TEACHER_STORAGE_SECRET;
  if (!value || value.length < 32) throw new Error("PROJECT4_SECRET is not configured.");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createProject4Token(payload: Omit<Project4Access, "exp">) {
  const body = Buffer.from(JSON.stringify({
    ...payload,
    exp: Date.now() + 8 * 60 * 60 * 1000,
  })).toString("base64url");
  return `${body}.${signature(body)}`;
}

export function readProject4Token(token: string, role?: Project4Access["role"]) {
  const [body, provided] = token.split(".");
  if (!body || !provided) throw new Error("로그인 정보가 올바르지 않습니다.");
  const expected = signature(body);
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new Error("로그인 정보가 올바르지 않습니다.");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Project4Access;
  if (payload.exp < Date.now() || (role && payload.role !== role)) {
    throw new Error("로그인 시간이 만료되었습니다. 다시 들어와 주세요.");
  }
  return payload;
}

export function validProject4TeacherPassword(value: string) {
  const configured = process.env.PROJECT4_TEACHER_PASSWORD?.trim();
  const accepted = configured ? [configured] : ["4523", "6556"];
  return accepted.includes(value.trim());
}
