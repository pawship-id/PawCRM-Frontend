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
 * `user` defaults to an account that REACHES EVERY BRANCH AND WAREHOUSE, so a
 * component test tests its component rather than the stock isolation that now
 * narrows every branch/warehouse picker (`utils/accessScope.ts`). It used to
 * default to null, which read as "scoped to nothing" the moment anything
 * consulted the account — turning unrelated suites red for a reason none of
 * them were about. Pass `user` to exercise a restricted scope, or `null` for a
 * component that must handle a signed-out shell.
 */

/** Every field a scope check or a "who is signed in" header reads. */
const FULL_REACH_USER = {
  _id: "auth-user",
  tenantId: "t1",
  email: "owner@paw.com",
  fullName: "Owner",
  phone: null,
  roleId: null,
  allBranches: true,
  branchAccess: [],
  warehouseAccess: [],
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  lockedUntil: null,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as User;
export function renderWithAuth(
  ui: ReactElement,
  {
    permissions = [],
    isSuperAdmin = true,
    user = FULL_REACH_USER,
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
