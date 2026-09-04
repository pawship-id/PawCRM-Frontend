"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { authService } from "@/services/auth.service";
import { ApiError } from "@/services/api-error";
import { setAuthHint, clearAuthHint } from "@/utils/authHint";
import type { PermissionGrant, SessionContext, User } from "@/types/api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  session: SessionContext | null;
  /**
   * The signed-in user's effective role grants, from the /me (or login)
   * payload. Empty while loading, signed out, or when the user has no role.
   * Drives the permission-gating UI — see features/permissions.
   */
  permissions: PermissionGrant[];
  /** True when the user's role bypasses every permission check. */
  isSuperAdmin: boolean;
  /** Sign in and populate the context. Throws ApiError on failure. */
  signIn: (email: string, password: string) => Promise<void>;
  /** End the session and clear local auth state. */
  signOut: () => Promise<void>;
  /** Re-fetch the current user (e.g. after a profile edit). */
  refresh: () => Promise<void>;
  /** Optimistically replace the cached user after a successful mutation. */
  setUser: (user: User) => void;
  /**
   * Point the session at a branch.
   *
   * IN THE AUTH CONTEXT RATHER THAN IN THE FEATURE THAT NEEDS IT, because the
   * branch is session state: it decides which branch a POS sale, a shift and a
   * journal entry are booked to. A screen that switched it privately would leave
   * every other screen reading a different one.
   */
  switchBranch: (branchId: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Routes that are read by somebody who has no account here.
 *
 * WHY THIS LIST EXISTS. This provider sits in the ROOT layout, so it wraps every
 * page in the app — including the ones a customer opens from a WhatsApp message.
 * Without this, every single receipt link opened would fire a `GET /auth/me`
 * that can only ever 401: a wasted round trip on somebody else's phone, and a
 * 401 in the log for every receipt anybody ever reads.
 *
 * WHY NOT MOVE THE PROVIDER instead, which would be tidier. It would have to be
 * mounted in both the `(auth)` and `(dashboard)` layouts, which are separate
 * trees — so signing in would UNMOUNT one provider and mount another, throwing
 * away the context that login just populated and firing a fresh `/me` on the
 * first dashboard paint. Trading one wasted request on a public page for one on
 * every login is not a trade.
 *
 * ADD A PREFIX HERE when a new page is opened by somebody signed out. Getting it
 * wrong is not dangerous — a missing entry costs one 401, a wrong one just means
 * a signed-in user's context loads a moment later, on their next navigation.
 */
export const PUBLIC_ROUTE_PREFIXES = ["/", "/struk"] as const;

/*
  "/" IS THE LANDING PAGE, AND IT MATCHES ONLY ITSELF. The test above is
  `pathname === prefix || pathname.startsWith(`${prefix}/`)`, and for "/" the
  second half is `startsWith("//")` — which no route is. So this entry does not
  quietly make the whole app public; a one-character change to that predicate
  would, which is why it is written down here.
*/

/**
 * Holds the authenticated user for the dashboard subtree.
 *
 * On mount it hydrates from GET /auth/me — the single source of truth. A 401
 * there means the (httpOnly) session is gone or expired: the hint cookie is
 * cleared and status becomes "unauthenticated", which the dashboard layout
 * turns into a redirect to /login.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicRoute = PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname?.startsWith(`${prefix}/`),
  );

  const [hydratedStatus, setStatus] = useState<AuthStatus>("loading");

  /*
    DERIVED, NOT SET. On a public route `/me` is never called, so the hydrated
    status would sit at "loading" forever — and a shell that waits forever is
    worse than one that says nobody is signed in. Writing it from the effect
    instead would be a cascading render for something that is a pure function of
    the route.

    Nothing here clears the auth hint: a signed-in cashier opening a customer's
    link in the same tab is not being signed out, and navigating back to the
    dashboard re-runs the effect below and hydrates them again.
  */
  const status: AuthStatus = isPublicRoute ? "unauthenticated" : hydratedStatus;
  const [user, setUserState] = useState<User | null>(null);
  const [session, setSession] = useState<SessionContext | null>(null);
  const [permissions, setPermissions] = useState<PermissionGrant[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Guards against a state update after unmount from the initial /me call.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const {
        user: me,
        session: ctx,
        permissions: grants = [],
        isSuperAdmin: superAdmin = false,
      } = await authService.me();
      if (!mounted.current) return;
      setUserState(me);
      setSession(ctx);
      setPermissions(grants);
      setIsSuperAdmin(superAdmin);
      setStatus("authenticated");
    } catch (error) {
      if (!mounted.current) return;
      // Any failure to prove a session leaves the user signed out. A network
      // error is treated the same — the dashboard cannot be shown without /me.
      if (!(error instanceof ApiError) || error.isUnauthorized) {
        clearAuthHint();
      }
      setUserState(null);
      setSession(null);
      setPermissions([]);
      setIsSuperAdmin(false);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    /*
      NOTHING TO HYDRATE ON A PUBLIC PAGE. The reader has no account, so `/me`
      could only ever 401 — see PUBLIC_ROUTE_PREFIXES. What the shell reports
      meanwhile is decided above, where it costs no render.
    */
    if (isPublicRoute) return;

    // Mount-time hydration from the server session — the canonical "synchronize
    // with an external system" use of an effect. refresh() only setStates after
    // an awaited /me, so this is not a synchronous cascading render despite what
    // the lint heuristic assumes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh, isPublicRoute]);

  const signIn = useCallback(async (email: string, password: string) => {
    const {
      user: me,
      session: ctx,
      permissions: grants = [],
      isSuperAdmin: superAdmin = false,
    } = await authService.login(email, password);
    setAuthHint();
    setUserState(me);
    setSession(ctx);
    setPermissions(grants);
    setIsSuperAdmin(superAdmin);
    setStatus("authenticated");
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      clearAuthHint();
      setUserState(null);
      setSession(null);
      setPermissions([]);
      setIsSuperAdmin(false);
      setStatus("unauthenticated");
    }
  }, []);

  const setUser = useCallback((next: User) => setUserState(next), []);

  const switchBranch = useCallback(async (branchId: string) => {
    const { currentBranchId } = await authService.switchBranch(branchId);
    // Only the branch is replaced. Re-fetching /me would work and would also
    // throw away the permission set for a round trip that answers nothing new.
    setSession((current) => ({ ...current, currentBranchId }));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      session,
      permissions,
      isSuperAdmin,
      signIn,
      signOut,
      refresh,
      setUser,
      switchBranch,
    }),
    [
      status,
      user,
      session,
      permissions,
      isSuperAdmin,
      signIn,
      signOut,
      refresh,
      setUser,
      switchBranch,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
