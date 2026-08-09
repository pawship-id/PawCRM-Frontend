import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";

import { AuthContext } from "@/features/auth/context/AuthProvider";
import type { AuthContextValue } from "@/features/auth/context/AuthProvider";
import type { PermissionGrant, User } from "@/types/api";

/**
 * Renders `ui` inside an AuthContext so permission-gated UI (Can /
 * usePermissions) works without the real AuthProvider and its /me fetch.
 *
 * Defaults to a super-admin, i.e. every `can` check passes — the right default
 * for component tests that assert an action is present. Pass `permissions`
 * and/or `isSuperAdmin: false` to exercise a restricted role.
 *
 * `user` defaults to null, which is what most callers need: permission gating
 * reads the grants, not the account. Pass one for a component that also shows
 * who is signed in.
 */
export function renderWithAuth(
  ui: ReactElement,
  {
    permissions = [],
    isSuperAdmin = true,
    user = null,
  }: {
    permissions?: PermissionGrant[];
    isSuperAdmin?: boolean;
    user?: User | null;
  } = {},
) {
  const value: AuthContextValue = {
    status: "authenticated",
    user,
    session: null,
    permissions,
    isSuperAdmin,
    signIn: jest.fn(),
    signOut: jest.fn(),
    refresh: jest.fn(),
    setUser: jest.fn(),
  };

  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );

  return render(ui, { wrapper });
}
