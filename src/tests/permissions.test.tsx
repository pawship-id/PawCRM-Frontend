import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";

import { AuthContext } from "@/features/auth/context/AuthProvider";
import type { AuthContextValue } from "@/features/auth/context/AuthProvider";
import { Can, RequirePermission, usePermissions } from "@/features/permissions";
import type { PermissionGrant } from "@/types/api";

/**
 * Wraps children in an AuthContext holding a fixed grant set, so the permission
 * primitives can be exercised without a real session or the AuthProvider's /me
 * fetch. Only the RBAC-relevant fields matter; the rest are inert stubs.
 */
function withAuth(
  ui: ReactNode,
  {
    permissions = [],
    isSuperAdmin = false,
  }: { permissions?: PermissionGrant[]; isSuperAdmin?: boolean } = {},
) {
  const value: AuthContextValue = {
    status: "authenticated",
    user: null,
    session: null,
    permissions,
    isSuperAdmin,
    signIn: jest.fn(),
    signOut: jest.fn(),
    refresh: jest.fn(),
    setUser: jest.fn(),
    switchBranch: jest.fn(),
  };
  return render(
    <AuthContext.Provider value={value}>{ui}</AuthContext.Provider>,
  );
}

/** A probe that renders the boolean result of a single `can` check. */
function CanProbe() {
  const { can } = usePermissions();
  return <span>{can("users", "create") ? "yes" : "no"}</span>;
}

describe("usePermissions", () => {
  it("grants an action the role holds", () => {
    withAuth(<CanProbe />, {
      permissions: [{ feature: "users", actions: ["create", "read"] }],
    });
    expect(screen.getByText("yes")).toBeInTheDocument();
  });

  it("denies an action the role lacks", () => {
    withAuth(<CanProbe />, {
      permissions: [{ feature: "users", actions: ["read"] }],
    });
    expect(screen.getByText("no")).toBeInTheDocument();
  });

  it("denies everything when the grant set is empty", () => {
    withAuth(<CanProbe />);
    expect(screen.getByText("no")).toBeInTheDocument();
  });

  it("super-admin passes every check regardless of grants", () => {
    withAuth(<CanProbe />, { isSuperAdmin: true });
    expect(screen.getByText("yes")).toBeInTheDocument();
  });
});

describe("Can", () => {
  it("renders children when permitted", () => {
    withAuth(
      <Can feature="roles" action="create">
        <button>New role</button>
      </Can>,
      { permissions: [{ feature: "roles", actions: ["create"] }] },
    );
    expect(screen.getByRole("button", { name: "New role" })).toBeInTheDocument();
  });

  it("renders the fallback (or nothing) when denied", () => {
    withAuth(
      <Can feature="roles" action="create" fallback={<span>denied</span>}>
        <button>New role</button>
      </Can>,
    );
    expect(screen.queryByRole("button", { name: "New role" })).toBeNull();
    expect(screen.getByText("denied")).toBeInTheDocument();
  });

  it("shows children when the user has ANY of an action array", () => {
    withAuth(
      <Can feature="users" action={["update", "delete"]}>
        <span>row actions</span>
      </Can>,
      { permissions: [{ feature: "users", actions: ["delete"] }] },
    );
    expect(screen.getByText("row actions")).toBeInTheDocument();
  });
});

describe("RequirePermission", () => {
  it("renders the page when the read permission is held", () => {
    withAuth(
      <RequirePermission feature="branches">
        <h1>Branches</h1>
      </RequirePermission>,
      { permissions: [{ feature: "branches", actions: ["read"] }] },
    );
    expect(screen.getByRole("heading", { name: "Branches" })).toBeInTheDocument();
  });

  it("shows access-denied when the read permission is missing", () => {
    withAuth(
      <RequirePermission feature="branches">
        <h1>Branches</h1>
      </RequirePermission>,
    );
    expect(screen.queryByRole("heading", { name: "Branches" })).toBeNull();
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
  });
});
