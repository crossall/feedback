import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  createGuestbookAdminSession,
  guestbookAdminEnabled,
  SHOWCASE_GUESTBOOK_ADMIN_COOKIE,
  SHOWCASE_GUESTBOOK_ADMIN_TTL_SECONDS,
  validGuestbookAdminPassword,
  validGuestbookAdminSession,
} from "@/lib/server/showcase-guestbook-auth";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2_048;

function responseJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
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

async function readBody(request: NextRequest) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw Object.assign(new Error("JSON 요청만 사용할 수 있습니다."), { status: 415 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    throw Object.assign(new Error("요청 내용이 너무 큽니다."), { status: 413 });
  }

  try {
    return JSON.parse(raw) as { password?: unknown };
  } catch {
    throw Object.assign(new Error("요청 형식을 확인해 주세요."), { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return responseJson({ error: "허용되지 않은 요청입니다." }, 403);
  if (!guestbookAdminEnabled()) return responseJson({ error: "운영자 기능이 아직 설정되지 않았습니다." }, 503);

  try {
    const body = await readBody(request);
    if (!validGuestbookAdminPassword(body.password)) {
      return responseJson({ error: "운영자 비밀번호가 맞지 않습니다." }, 401);
    }

    const response = responseJson({ ok: true, admin: true });
    response.cookies.set(SHOWCASE_GUESTBOOK_ADMIN_COOKIE, createGuestbookAdminSession(), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: SHOWCASE_GUESTBOOK_ADMIN_TTL_SECONDS,
      path: "/api/showcase/guestbook",
    });
    return response;
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof error.status === "number"
      ? error.status
      : 500;
    const message = status < 500 && error instanceof Error ? error.message : "로그인하지 못했습니다.";
    return responseJson({ error: message }, status);
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return responseJson({ error: "허용되지 않은 요청입니다." }, 403);

  const response = responseJson({ ok: true });
  response.cookies.set(SHOWCASE_GUESTBOOK_ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/api/showcase/guestbook",
  });
  return response;
}

export async function GET(request: NextRequest) {
  const admin = validGuestbookAdminSession(request.cookies.get(SHOWCASE_GUESTBOOK_ADMIN_COOKIE)?.value);
  return responseJson({ admin, adminEnabled: guestbookAdminEnabled() });
}
