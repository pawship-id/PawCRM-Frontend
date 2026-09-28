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

/**
 * The row's actions live behind one kebab since 28 September 2026, so every
 * assertion about them has to open it first. Named after the branch, because
 * that is what the trigger's accessible name says.
 */
async function openRowMenu(name: string) {
  await userEvent.click(
    screen.getByRole("button", { name: `Aksi untuk ${name}` }),
  );
  return screen.getByRole("menu");
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
    expect(screen.getByText("Aktif")).toBeInTheDocument();
  });

  it("shows the empty state when there are no branches", () => {
    renderWithAuth(
      <BranchesTable branches={[]} loading={false} onChanged={jest.fn()} />,
    );
    expect(
      screen.getByText(/tidak ada cabang yang cocok dengan filter ini/i),
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

    const menu = await openRowMenu("Jakarta");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /hapus/i }),
    );

    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^hapus$/i }),
    );

    expect(remove).toHaveBeenCalledWith("b1");
    expect(onChanged).toHaveBeenCalled();
  });

  /*
    A READ-ONLY ROLE STILL GETS A WAY IN (28 September 2026). The row's link
    opens `/cabang/:id`, which is the branch's read-only DETAIL now — so it
    needs no grant beyond the `branches:read` this table already required. It
    used to be an Edit link gated on `branches:update`, which left exactly this
    role looking at a list it could not open anything from.
  */
  it("gives a read-only role a menu holding Detail alone", async () => {
    renderWithAuth(
      <BranchesTable
        branches={[makeBranch()]}
        loading={false}
        onChanged={jest.fn()}
      />,
      { isSuperAdmin: false, permissions: [{ feature: "branches", actions: ["read"] }] },
    );

    expect(
      screen.getByRole("columnheader", { name: /aksi/i }),
    ).toBeInTheDocument();

    const menu = await openRowMenu("Jakarta");
    // Exactly one row, and it is the one that writes nothing.
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    expect(within(menu).getByRole("menuitem", { name: /detail/i })).toHaveAttribute(
      "href",
      "/dashboard/pengaturan/cabang/b1",
    );
  });

  it("shows the Actions column when at least one action is permitted", async () => {
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
      screen.getByRole("columnheader", { name: /aksi/i }),
    ).toBeInTheDocument();

    const menu = await openRowMenu("Jakarta");
    expect(within(menu).getByRole("menuitem", { name: /detail/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /ubah/i })).toHaveAttribute(
      "href",
      "/dashboard/pengaturan/cabang/b1/edit",
    );
    // Delete not granted → its row stays out even though the menu opens.
    expect(
      within(menu).queryByRole("menuitem", { name: /hapus/i }),
    ).not.toBeInTheDocument();
  });

  /*
    ONLY A DELETED ROW CAN STILL COME UP EMPTY. There is no detail page to
    offer for one, so for a role that cannot restore it there is nothing to put
    in the column — and with every listed row deleted, the column goes.
  */
  it("hides Actions when every listed row is deleted and none can be restored", () => {
    renderWithAuth(
      <BranchesTable
        branches={[makeBranch({ deletedAt: "2026-02-01T00:00:00.000Z" })]}
        loading={false}
        onChanged={jest.fn()}
      />,
      {
        isSuperAdmin: false,
        permissions: [{ feature: "branches", actions: ["read"] }],
      },
    );

    expect(
      screen.queryByRole("columnheader", { name: /aksi/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Actions for a restore-only role once a deleted row is listed", async () => {
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
      screen.getByRole("columnheader", { name: /aksi/i }),
    ).toBeInTheDocument();

    const menu = await openRowMenu("Jakarta");
    expect(
      within(menu).getByRole("menuitem", { name: /pulihkan/i }),
    ).toBeInTheDocument();
  });

  it("offers restore for a deleted branch, and nothing else", async () => {
    renderWithAuth(
      <BranchesTable
        branches={[makeBranch({ deletedAt: "2026-02-01T00:00:00.000Z" })]}
        loading={false}
        onChanged={jest.fn()}
      />,
    );

    expect(screen.getByText("Terhapus")).toBeInTheDocument();

    /*
      A DELETED BRANCH HAS NO DETAIL PAGE and nothing to edit, so restoring it
      is the only row in the menu — not one option among four.
    */
    const menu = await openRowMenu("Jakarta");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    expect(
      within(menu).getByRole("menuitem", { name: /pulihkan/i }),
    ).toBeInTheDocument();
  });
});
