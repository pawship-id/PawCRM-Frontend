/**
 * THE LAST SIGNED-IN SESSION, REMEMBERED (POS offline mode, 19 October 2026).
 *
 * `/auth/me` is what tells the app who is signed in, and on a till whose
 * connection has dropped it cannot answer — which used to look exactly like
 * being signed out, and sent a cashier mid-sale to the login page. So the last
 * good answer is kept here and used ONLY when the server could not be reached.
 * A 401 still signs out, and signing out forgets it.
 *
 * NOTHING SECRET: the session cookie stays httpOnly and is never read; this is
 * the profile, the role's grants and the chosen branch — what the screen draws.
 */
import type { PermissionGrant, SessionContext, User } from "@/types/api";

export interface CachedAuth {
  user: User;
  session: SessionContext | null;
  permissions: PermissionGrant[];
  isSuperAdmin: boolean;
  disabledModules: string[];
  disabledFeatures: string[];
  savedAt: string;
}

const KEY = "buloo.auth.cache";

export function readAuthCache(): CachedAuth | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CachedAuth) : null;
  } catch {
    return null;
  }
}

export function writeAuthCache(value: Omit<CachedAuth, "savedAt">): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...value, savedAt: new Date().toISOString() }));
  } catch {
    // A session that cannot be remembered still works while online.
  }
}

export function clearAuthCache(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
