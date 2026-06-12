import { NextResponse } from "next/server";
import { completeGoogleOAuth } from "@/lib/server/google-oauth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(new URL("/?oauth=cancelled", url.origin));
  }
  try {
    const result = await completeGoogleOAuth({ code, state, origin: url.origin });
    const target = new URL(result.returnTo, url.origin);
    target.searchParams.set("oauth", "connected");
    return NextResponse.redirect(target);
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    const target = new URL("/", url.origin);
    target.searchParams.set("oauth", "failed");
    return NextResponse.redirect(target);
  }
}
