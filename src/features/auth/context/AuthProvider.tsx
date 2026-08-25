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
 * Holds the authenticated user for the dashboard subtree.
 *
 * On mount it hydrates from GET /auth/me — the single source of truth. A 401
 * there means the (httpOnly) session is gone or expired: the hint cookie is
 * cleared and status becomes "unauthenticated", which the dashboard layout
 * turns into a redirect to /login.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
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
    // Mount-time hydration from the server session — the canonical "synchronize
    // with an external system" use of an effect. refresh() only setStates after
    // an awaited /me, so this is not a synchronous cascading render despite what
    // the lint heuristic assumes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

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
