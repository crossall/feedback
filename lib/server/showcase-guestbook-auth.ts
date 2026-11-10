import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const SHOWCASE_GUESTBOOK_ADMIN_COOKIE = "showcase_guestbook_admin";
export const SHOWCASE_GUESTBOOK_ADMIN_TTL_SECONDS = 4 * 60 * 60;

type AdminSession = {
  scope: "showcase-guestbook";
  exp: number;
};

function adminSecret() {
  const value = process.env.SHOWCASE_GUESTBOOK_ADMIN_KEY?.trim() || "";
  return value.length >= 12 ? value : "";
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function guestbookAdminEnabled() {
  return Boolean(adminSecret());
}

export function validGuestbookAdminPassword(candidate: unknown) {
  const secret = adminSecret();
  if (!secret || typeof candidate !== "string") return false;
  return safeEqual(secret, candidate.trim());
}

export function createGuestbookAdminSession() {
  const secret = adminSecret();
  if (!secret) throw new Error("SHOWCASE_GUESTBOOK_ADMIN_KEY is not configured.");

  const session: AdminSession = {
    scope: "showcase-guestbook",
    exp: Date.now() + SHOWCASE_GUESTBOOK_ADMIN_TTL_SECONDS * 1_000,
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function validGuestbookAdminSession(token: string | undefined) {
  const secret = adminSecret();
  if (!secret || !token) return false;

  const [payload, providedSignature, ...extra] = token.split(".");
  if (!payload || !providedSignature || extra.length > 0) return false;
  if (!safeEqual(providedSignature, sign(payload, secret))) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<AdminSession>;
    return session.scope === "showcase-guestbook"
      && typeof session.exp === "number"
      && session.exp > Date.now();
  } catch {
    return false;
  }
}
