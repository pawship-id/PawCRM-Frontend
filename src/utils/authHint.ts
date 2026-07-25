/**
 * The "signed-in hint" cookie.
 *
 * The real session is an httpOnly cookie set by the backend on ITS origin, which
 * the frontend's `proxy.ts` (a different origin in dev) cannot read. This
 * small, non-secret companion cookie is set by client JS on login and cleared on
 * logout purely so the proxy can make a fast redirect decision. It is NOT
 * authority — GET /auth/me is. A stale hint is self-correcting: /me returns 401,
 * the app clears the hint and redirects to login.
 */
export const AUTH_HINT_COOKIE = "pawcrm_authed";

export function setAuthHint(): void {
  if (typeof document === "undefined") return;
  // Session cookie (no Max-Age) so it dies with the browser; the httpOnly
  // session governs real expiry regardless.
  document.cookie = `${AUTH_HINT_COOKIE}=1; Path=/; SameSite=Lax`;
}

export function clearAuthHint(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${AUTH_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
