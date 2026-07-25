import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { AUTH_HINT_COOKIE } from "@/utils/authHint";

/**
 * Route guard. (In Next.js 16 this file convention is `proxy`, formerly
 * `middleware`.)
 *
 * It reads only the non-secret "signed-in hint" cookie — the real session is
 * httpOnly and scoped to the BACKEND origin, so the frontend server can't see
 * it. The hint lets us redirect fast in the common cases; the AuthProvider's
 * GET /auth/me is the real authority and corrects a stale hint (an expired
 * session redirects back here on its next navigation).
 *
 *   - No hint on a /dashboard route  → send to /login (remember where they were)
 *   - Hint present on an auth route   → send to the dashboard
 */

const DASHBOARD_HOME = "/dashboard/profile";
const AUTH_ROUTES = ["/login", "/forgot-password", "/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasHint = request.cookies.has(AUTH_HINT_COOKIE);

  const isDashboard = pathname.startsWith("/dashboard");
  const isAuthRoute = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isDashboard && !hasHint) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Preserve the intended destination so login can bounce back to it.
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && hasHint) {
    const url = request.nextUrl.clone();
    url.pathname = DASHBOARD_HOME;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/login",
    "/forgot-password",
    "/reset-password",
  ],
};
