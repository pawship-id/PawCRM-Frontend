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
import type { SessionContext, User } from "@/types/api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  session: SessionContext | null;
  /** Sign in and populate the context. Throws ApiError on failure. */
  signIn: (email: string, password: string) => Promise<void>;
  /** End the session and clear local auth state. */
  signOut: () => Promise<void>;
  /** Re-fetch the current user (e.g. after a profile edit). */
  refresh: () => Promise<void>;
  /** Optimistically replace the cached user after a successful mutation. */
  setUser: (user: User) => void;
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
      const { user: me, session: ctx } = await authService.me();
      if (!mounted.current) return;
      setUserState(me);
      setSession(ctx);
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
    const { user: me, session: ctx } = await authService.login(email, password);
    setAuthHint();
    setUserState(me);
    setSession(ctx);
    setStatus("authenticated");
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      clearAuthHint();
      setUserState(null);
      setSession(null);
      setStatus("unauthenticated");
    }
  }, []);

  const setUser = useCallback((next: User) => setUserState(next), []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, session, signIn, signOut, refresh, setUser }),
    [status, user, session, signIn, signOut, refresh, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
