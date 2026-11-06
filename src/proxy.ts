import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight route guard: app routes require a session cookie. The cookie is only a hint —
 * every page and action re-verifies the session and workspace membership on the server.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/api/health") || pathname.startsWith("/api/jobs");
  if (isPublic) return NextResponse.next();
  const hasSession = Boolean(request.cookies.get("ih_session")?.value);
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|webp|ico)).*)"],
};
