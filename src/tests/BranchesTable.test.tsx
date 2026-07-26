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
    address: "Jl. Sudirman 1",
    phone: "021-555-1234",
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
