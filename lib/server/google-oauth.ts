import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { get, put } from "@vercel/blob";
import { google } from "googleapis";
import { isTeacherId, type TeacherId } from "@/lib/teacher-evaluations";

type GoogleTokens = {
  accessToken?: string;
  refreshToken?: string;
  expiryDate?: number;
  scope?: string;
  connectedAt: string;
};

type OAuthState = {
  teacherId: TeacherId;
  returnTo: string;
  createdAt: number;
};

function getEncryptionKey() {
  const secret = process.env.TEACHER_STORAGE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("TEACHER_STORAGE_SECRET is not configured.");
  }
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function decrypt<T>(payload: string): T {
  const value = Buffer.from(payload, "base64url");
  if (value.length < 29) throw new Error("Invalid encrypted payload.");
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), value.subarray(0, 12));
  decipher.setAuthTag(value.subarray(12, 28));
  return JSON.parse(Buffer.concat([
    decipher.update(value.subarray(28)),
    decipher.final(),
  ]).toString("utf8")) as T;
}

function tokenPath(teacherId: TeacherId) {
  return `google-oauth/${teacherId}.json`;
}

export function isGoogleOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID
    && process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
}

function createOAuthClient(origin: string) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth 앱이 아직 설정되지 않았습니다.");
  }
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI
    || `${origin}/api/google/oauth/callback`;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function readTokens(teacherId: TeacherId): Promise<GoogleTokens | null> {
  const result = await get(tokenPath(teacherId), {
    access: "private",
    useCache: false,
  });
  if (!result) return null;
  const encrypted = await new Response(result.stream).text();
  return decrypt<GoogleTokens>(encrypted);
}

async function writeTokens(teacherId: TeacherId, tokens: GoogleTokens) {
  await put(tokenPath(teacherId), encrypt(tokens), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "text/plain",
  });
}

export function createGoogleOAuthUrl(input: {
  teacherId: TeacherId;
  returnTo: string;
  origin: string;
}) {
  const oauth = createOAuthClient(input.origin);
  const state = encrypt({
    teacherId: input.teacherId,
    returnTo: input.returnTo,
    createdAt: Date.now(),
  } satisfies OAuthState);
  return oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ],
    state,
  });
}

export async function completeGoogleOAuth(input: {
  code: string;
  state: string;
  origin: string;
}) {
  const state = decrypt<OAuthState>(input.state);
  if (!isTeacherId(state.teacherId) || Date.now() - state.createdAt > 10 * 60 * 1000) {
    throw new Error("Google 인증 요청이 만료되었습니다.");
  }
  const oauth = createOAuthClient(input.origin);
  const { tokens } = await oauth.getToken(input.code);
  const existing = await readTokens(state.teacherId);
  await writeTokens(state.teacherId, {
    accessToken: tokens.access_token ?? undefined,
    refreshToken: tokens.refresh_token ?? existing?.refreshToken,
    expiryDate: tokens.expiry_date ?? undefined,
    scope: tokens.scope ?? undefined,
    connectedAt: new Date().toISOString(),
  });
  return state;
}

export async function getGoogleConnectionStatus(teacherId: TeacherId) {
  const tokens = await readTokens(teacherId);
  return {
    configured: isGoogleOAuthConfigured(),
    connected: Boolean(tokens?.refreshToken || tokens?.accessToken),
    connectedAt: tokens?.connectedAt ?? null,
  };
}

export async function getTeacherGoogleAuth(teacherIdValue: string, origin: string) {
  if (!isTeacherId(teacherIdValue)) {
    throw new Error("Google 계정이 연결된 교사 정보를 찾지 못했습니다.");
  }
  const tokens = await readTokens(teacherIdValue);
  if (!tokens?.refreshToken && !tokens?.accessToken) {
    throw new Error("선생님의 Google 계정 인증이 필요합니다. 교사 설정 페이지에서 Google 계정을 먼저 연결해 주세요.");
  }
  const oauth = createOAuthClient(origin);
  oauth.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiryDate,
    scope: tokens.scope,
  });
  oauth.on("tokens", async (nextTokens) => {
    await writeTokens(teacherIdValue, {
      accessToken: nextTokens.access_token ?? tokens.accessToken,
      refreshToken: nextTokens.refresh_token ?? tokens.refreshToken,
      expiryDate: nextTokens.expiry_date ?? tokens.expiryDate,
      scope: nextTokens.scope ?? tokens.scope,
      connectedAt: tokens.connectedAt,
    });
  });
  return oauth;
}
