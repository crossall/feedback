import { NextResponse } from "next/server";
import { isTeacherId } from "@/lib/teacher-evaluations";
import {
  createGoogleOAuthUrl,
  isGoogleOAuthConfigured,
} from "@/lib/server/google-oauth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const teacherId = url.searchParams.get("teacher") ?? "";
  const returnTo = url.searchParams.get("returnTo") || `/docs/teacher?teacher=${teacherId}`;
  if (!isTeacherId(teacherId)) {
    return NextResponse.redirect(new URL("/?oauth=invalid-teacher", url.origin));
  }
  if (!isGoogleOAuthConfigured()) {
    const target = new URL(returnTo, url.origin);
    target.searchParams.set("oauth", "not-configured");
    return NextResponse.redirect(target);
  }
  return NextResponse.redirect(createGoogleOAuthUrl({
    teacherId,
    returnTo,
    origin: url.origin,
  }));
}
