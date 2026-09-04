import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { BranchesTable } from "@/features/branches/components/BranchesTable";
import { branchService } from "@/services/branch.service";
import type { Branch } from "@/types/api";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

// Row actions fire a SweetAlert2 toast on success; mock the library so no real
// dialog is created during the test.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

function makeBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    _id: "b1",
    tenantId: "t1",
    name: "Jakarta",
    code: null,
    address: "Jl. Sudirman 1",
    phone: "021-555-1234",
    receiptFooter: null,
    location: { lat: null, lng: null, source: "manual" },
    isActive: true,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("BranchesTable", () => {
  afterEach(() => jest.restoreAllMocks());

  it("renders a row with the name, contact and state", () => {
    renderWithAuth(
      <BranchesTable
        branches={[makeBranch()]}
        loading={false}
        onChanged={jest.fn()}
      />,
    );

    expect(screen.getByText("Jakarta")).toBeInTheDocument();
    expect(screen.getByText("Jl. Sudirman 1")).toBeInTheDocument();
    expect(screen.getByText("021-555-1234")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows the empty state when there are no branches", () => {
    renderWithAuth(
      <BranchesTable branches={[]} loading={false} onChanged={jest.fn()} />,
    );
    expect(
      screen.getByText(/no branches match the current filters/i),
    ).toBeInTheDocument();
  });

  it("confirms and deletes a branch, then refetches", async () => {
    const remove = jest
      .spyOn(branchService, "remove")
      .mockResolvedValue({} as never);
    const onChanged = jest.fn();

    renderWithAuth(
      <BranchesTable
        branches={[makeBranch()]}
        loading={false}
        onChanged={onChanged}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /delete/i }));

    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^delete$/i }),
    );

    expect(remove).toHaveBeenCalledWith("b1");
    expect(onChanged).toHaveBeenCalled();
  });

  it("hides the Actions column when the role has no branch actions", () => {
    // Read-only role: no update/delete/restore, so the whole column disappears.
    renderWithAuth(
      <BranchesTable
        branches={[makeBranch()]}
        loading={false}
        onChanged={jest.fn()}
      />,
      { isSuperAdmin: false, permissions: [{ feature: "branches", actions: ["read"] }] },
    );

    expect(
      screen.queryByRole("columnheader", { name: /actions/i }),
    ).not.toBeInTheDocument();
    // Edit renders as a link (Button asChild → <a>); delete as a button.
    expect(
      screen.queryByRole("link", { name: /edit/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the Actions column when at least one action is permitted", () => {
    renderWithAuth(
      <BranchesTable
        branches={[makeBranch()]}
        loading={false}
        onChanged={jest.fn()}
      />,
      {
        isSuperAdmin: false,
        permissions: [{ feature: "branches", actions: ["read", "update"] }],
      },
    );

    expect(
      screen.getByRole("columnheader", { name: /actions/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /edit/i })).toBeInTheDocument();
    // Delete not granted → its button stays hidden even though the column shows.
    expect(
      screen.queryByRole("button", { name: /delete/i }),
    ).not.toBeInTheDocument();
  });

  it("hides Actions for a restore-only role when no row is deleted", () => {
    // read + restore, but every listed branch is live → only Edit/Delete would
    // apply (both lacked) → no button on any row → column hidden.
    renderWithAuth(
      <BranchesTable
        branches={[makeBranch()]}
        loading={false}
        onChanged={jest.fn()}
      />,
      {
        isSuperAdmin: false,
        permissions: [{ feature: "branches", actions: ["read", "restore"] }],
      },
    );

    expect(
      screen.queryByRole("columnheader", { name: /actions/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Actions for a restore-only role once a deleted row is listed", () => {
    // Same role, but a deleted branch is present (show-deleted on) → its Restore
    // button applies → the column appears.
    renderWithAuth(
      <BranchesTable
        branches={[makeBranch({ deletedAt: "2026-02-01T00:00:00.000Z" })]}
        loading={false}
        onChanged={jest.fn()}
      />,
      {
        isSuperAdmin: false,
        permissions: [{ feature: "branches", actions: ["read", "restore"] }],
      },
    );

    expect(
      screen.getByRole("columnheader", { name: /actions/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();
  });

  it("offers restore for a deleted branch", () => {
    renderWithAuth(
      <BranchesTable
        branches={[makeBranch({ deletedAt: "2026-02-01T00:00:00.000Z" })]}
        loading={false}
        onChanged={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /restore/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Deleted")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^delete$/i }),
    ).not.toBeInTheDocument();
  });
});
