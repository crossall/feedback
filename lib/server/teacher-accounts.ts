import "server-only";

import { cookies } from "next/headers";
import { get, put } from "@vercel/blob";
import { isTeacherId, type TeacherId } from "@/lib/teacher-evaluations";
import {
  createTeacherSessionToken,
  TEACHER_SESSION_COOKIE,
  TEACHER_SESSION_MAX_AGE_SECONDS,
  verifyTeacherSessionToken,
} from "@/lib/teacher-session";

export { createTeacherSessionToken, TEACHER_SESSION_COOKIE };

type TeacherAccount = {
  teacherId: TeacherId;
  name: string;
  createdAt: string;
};

const DEFAULT_TEACHER_ACCOUNTS: TeacherAccount[] = [
  { teacherId: "4523", name: "김태령", createdAt: "2026-01-01T00:00:00.000Z" },
  { teacherId: "6556", name: "전혜리", createdAt: "2026-01-01T00:00:00.000Z" },
  { teacherId: "7244", name: "주애리", createdAt: "2026-01-01T00:00:00.000Z" },
];

const ACCOUNTS_PATH = "teachers/accounts.json";
function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, "").normalize("NFC");
}

function validateCredentials(nameValue: string, teacherIdValue: string) {
  const name = normalizeName(nameValue);
  const teacherId = teacherIdValue.trim();
  if (name.length < 2) throw new Error("이름을 두 글자 이상 입력해 주세요.");
  if (!isTeacherId(teacherId)) throw new Error("번호는 숫자 4자리로 입력해 주세요.");
  return { name, teacherId };
}

async function readCustomAccounts(): Promise<TeacherAccount[]> {
  const result = await get(ACCOUNTS_PATH, { access: "private", useCache: false });
  if (!result) return [];
  const body = await new Response(result.stream).json() as TeacherAccount[];
  return Array.isArray(body) ? body : [];
}

async function writeCustomAccounts(accounts: TeacherAccount[]) {
  await put(ACCOUNTS_PATH, JSON.stringify(accounts), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function listTeacherAccounts() {
  const customAccounts = await readCustomAccounts();
  const merged = new Map<string, TeacherAccount>();
  for (const account of [...DEFAULT_TEACHER_ACCOUNTS, ...customAccounts]) {
    merged.set(account.teacherId, account);
  }
  return Array.from(merged.values());
}

export async function authenticateTeacher(nameValue: string, teacherIdValue: string) {
  const { name, teacherId } = validateCredentials(nameValue, teacherIdValue);
  const account = (await listTeacherAccounts()).find((item) => item.teacherId === teacherId);
  if (!account || normalizeName(account.name) !== name) {
    throw new Error("이름과 4자리 번호가 일치하지 않습니다.");
  }
  return account;
}

export async function registerTeacher(nameValue: string, teacherIdValue: string) {
  const { name, teacherId } = validateCredentials(nameValue, teacherIdValue);
  const accounts = await listTeacherAccounts();
  if (accounts.some((account) => account.teacherId === teacherId)) {
    throw new Error("이미 사용 중인 번호입니다. 다른 4자리 번호를 선택해 주세요.");
  }

  const customAccounts = await readCustomAccounts();
  const account: TeacherAccount = {
    teacherId,
    name,
    createdAt: new Date().toISOString(),
  };
  await writeCustomAccounts([...customAccounts, account]);
  return account;
}

export async function getTeacherSessionId() {
  const cookieStore = await cookies();
  return verifyTeacherSessionToken(cookieStore.get(TEACHER_SESSION_COOKIE)?.value);
}

export async function isTeacherSessionFor(teacherId: string) {
  return isTeacherId(teacherId) && await getTeacherSessionId() === teacherId;
}

export const teacherSessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: TEACHER_SESSION_MAX_AGE_SECONDS,
};
