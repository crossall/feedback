import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  TEACHER_SESSION_COOKIE,
  verifyTeacherSessionToken,
} from "@/lib/teacher-session";

const MAINTENANCE_PATH = "/maintenance";
const PRIVACY_PATH = "/privacy";
const SHOWCASE_PATH = "/showcase";
const MAINTENANCE_MODE = false;
const ALWAYS_OPEN_PATHS = [PRIVACY_PATH, SHOWCASE_PATH];
const TEACHER_QUERY_PATHS = ["/teacher", "/docs/teacher", "/peer/teacher", "/session/teacher"];

function requestedTeacherId(request: NextRequest) {
  const dashboardMatch = request.nextUrl.pathname.match(/^\/teacher\/(\d{4})(?:\/|$)/);
  if (dashboardMatch) return dashboardMatch[1];
  if (TEACHER_QUERY_PATHS.includes(request.nextUrl.pathname)) {
    return request.nextUrl.searchParams.get("teacher") ?? "";
  }
  return null;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const teacherId = requestedTeacherId(request);

  if (teacherId !== null) {
    const sessionTeacherId = verifyTeacherSessionToken(
      request.cookies.get(TEACHER_SESSION_COOKIE)?.value,
    );
    if (!teacherId || sessionTeacherId !== teacherId) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  if (
    !MAINTENANCE_MODE ||
    pathname === MAINTENANCE_PATH ||
    ALWAYS_OPEN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  ) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = MAINTENANCE_PATH;
  url.search = "";

  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|sitemap.xml|robots.txt).*)"],
};
