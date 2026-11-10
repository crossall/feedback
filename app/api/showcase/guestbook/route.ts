import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  GUESTBOOK_MESSAGE_MAX,
  GUESTBOOK_NICKNAME_MAX,
  GUESTBOOK_REPLY_MAX,
  type GuestbookEntry,
  type GuestbookEntryKind,
} from "@/lib/showcase-guestbook";
import {
  createGuestbookEntry,
  deleteGuestbookEntry,
  getGuestbookEntry,
  isGuestbookWriteConflict,
  listGuestbookEntries,
  updateGuestbookEntry,
} from "@/lib/server/showcase-guestbook-store";
import {
  guestbookAdminEnabled,
  SHOWCASE_GUESTBOOK_ADMIN_COOKIE,
  validGuestbookAdminSession,
} from "@/lib/server/showcase-guestbook-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const POST_COOKIE = "showcase_guestbook_posted";
const POST_COOLDOWN_SECONDS = 20;
const MAX_BODY_BYTES = 8_192;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTACT_PATTERN = /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|01[016789][\s.-]?\d{3,4}[\s.-]?\d{4})/i;

type CreateBody = {
  kind?: unknown;
  nickname?: unknown;
  message?: unknown;
  consent?: unknown;
  website?: unknown;
  startedAt?: unknown;
};

type AdminBody = {
  id?: unknown;
  action?: unknown;
  reply?: unknown;
};

function responseJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

function normalizeSingleLine(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeMessage(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const originUrl = new URL(origin);
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const protocol = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
    return originUrl.host === host && originUrl.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

function validId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isKind(value: unknown): value is GuestbookEntryKind {
  return value === "guestbook" || value === "question";
}

function isAdmin(request: NextRequest) {
  return validGuestbookAdminSession(request.cookies.get(SHOWCASE_GUESTBOOK_ADMIN_COOKIE)?.value);
}

async function readJsonBody<T>(request: NextRequest) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw Object.assign(new Error("JSON 요청만 사용할 수 있습니다."), { status: 415 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    throw Object.assign(new Error("요청 내용이 너무 큽니다."), { status: 413 });
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw Object.assign(new Error("요청 형식을 확인해 주세요."), { status: 400 });
  }
}

function requestError(error: unknown, fallback: string) {
  const status = typeof error === "object" && error && "status" in error && typeof error.status === "number"
    ? error.status
    : 500;
  const message = status < 500 && error instanceof Error ? error.message : fallback;
  return responseJson({ error: message }, status);
}

export async function GET(request: NextRequest) {
  try {
    const admin = isAdmin(request);
    const wantsAdminEntries = request.nextUrl.searchParams.get("scope") === "admin";
    if (wantsAdminEntries && !admin) {
      return responseJson({ error: "운영자 로그인이 필요합니다." }, 401);
    }
    const entries = await listGuestbookEntries(wantsAdminEntries && admin);
    return responseJson({ entries, admin, adminEnabled: guestbookAdminEnabled() });
  } catch (error) {
    console.error("Showcase guestbook list failed:", error);
    return responseJson({ error: "방명록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요." }, 500);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return responseJson({ error: "허용되지 않은 요청입니다." }, 403);

  try {
    const body = await readJsonBody<CreateBody>(request);

    if (normalizeSingleLine(body.website)) {
      return responseJson({ ok: true, entry: null });
    }

    const startedAt = Number(body.startedAt);
    const elapsed = Date.now() - startedAt;
    if (!Number.isFinite(startedAt) || elapsed < 2_000 || elapsed > 7_200_000) {
      return responseJson({ error: "입력 시간을 확인해 주세요." }, 400);
    }

    if (request.cookies.get(POST_COOKIE)) {
      return responseJson({ error: `${POST_COOLDOWN_SECONDS}초 뒤에 다시 남길 수 있습니다.` }, 429);
    }

    if (!isKind(body.kind)) return responseJson({ error: "글 종류를 선택해 주세요." }, 400);
    if (body.consent !== true) return responseJson({ error: "개인정보 안내를 확인해 주세요." }, 400);

    const nickname = normalizeSingleLine(body.nickname);
    const message = normalizeMessage(body.message);
    if (!nickname || nickname.length > GUESTBOOK_NICKNAME_MAX) {
      return responseJson({ error: `별명은 1~${GUESTBOOK_NICKNAME_MAX}자로 입력해 주세요.` }, 400);
    }
    if (message.length < 2 || message.length > GUESTBOOK_MESSAGE_MAX) {
      return responseJson({ error: `내용은 2~${GUESTBOOK_MESSAGE_MAX}자로 입력해 주세요.` }, 400);
    }
    if (CONTACT_PATTERN.test(`${nickname} ${message}`)) {
      return responseJson({ error: "연락처, 이메일, 외부 링크는 남길 수 없습니다." }, 400);
    }

    const entry: GuestbookEntry = {
      id: randomUUID(),
      kind: body.kind,
      nickname,
      message,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    await createGuestbookEntry(entry);

    const response = responseJson({ ok: true, entry }, 201);
    response.cookies.set(POST_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: POST_COOLDOWN_SECONDS,
      path: "/api/showcase/guestbook",
    });
    return response;
  } catch (error) {
    console.error("Showcase guestbook create failed:", error);
    return requestError(error, "글을 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return responseJson({ error: "허용되지 않은 요청입니다." }, 403);
  if (!isAdmin(request)) return responseJson({ error: "운영자 로그인이 필요합니다." }, 401);

  try {
    const body = await readJsonBody<AdminBody>(request);
    if (!validId(body.id)) return responseJson({ error: "글 번호를 확인해 주세요." }, 400);

    const record = await getGuestbookEntry(body.id);
    if (!record) return responseJson({ error: "글을 찾지 못했습니다." }, 404);
    if (body.action === "delete") {
      await deleteGuestbookEntry(body.id, record.etag);
      return responseJson({ ok: true, deleted: body.id });
    }

    const entry = { ...record.entry };

    if (body.action === "show" || body.action === "hide") {
      entry.status = body.action === "show" ? "published" : "hidden";
    } else if (body.action === "reply") {
      const message = normalizeMessage(body.reply);
      if (!message || message.length > GUESTBOOK_REPLY_MAX) {
        return responseJson({ error: `답변은 1~${GUESTBOOK_REPLY_MAX}자로 입력해 주세요.` }, 400);
      }
      entry.reply = { message, createdAt: new Date().toISOString() };
    } else {
      return responseJson({ error: "관리 동작을 확인해 주세요." }, 400);
    }

    await updateGuestbookEntry(entry, record.etag);
    return responseJson({ ok: true, entry });
  } catch (error) {
    console.error("Showcase guestbook update failed:", error);
    if (isGuestbookWriteConflict(error)) {
      return responseJson({ error: "다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 시도해 주세요." }, 409);
    }
    return requestError(error, "글을 수정하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  }
}
