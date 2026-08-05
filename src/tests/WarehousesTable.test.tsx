import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { WarehousesTable } from "@/features/warehouses/components/WarehousesTable";
import { warehouseService } from "@/services/warehouse.service";
import { ApiError } from "@/services/api-error";
import type { Warehouse } from "@/types/api";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

// Row actions fire a SweetAlert2 toast on success; mock the library so no real
// dialog is created during the test.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

function makeWarehouse(overrides: Partial<Warehouse> = {}): Warehouse {
  return {
    _id: "w1",
    tenantId: "t1",
    name: "Gudang Pusat",
    defaultBranchId: "b1",
    address: "Jl. Sudirman 1",
    picName: "Budi",
    picPhone: "021-555-1234",
    isActive: true,
    isDefault: false,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Stands in for useWarehouseBranches' resolver, which the screen owns. */
const branchName = (id: string | null) => (id === "b1" ? "Jakarta" : null);

describe("WarehousesTable", () => {
  afterEach(() => jest.restoreAllMocks());

  it("renders a row with the name, branch, address, PIC and state", () => {
    renderWithAuth(
      <WarehousesTable
        warehouses={[makeWarehouse()]}
        loading={false}
        onChanged={jest.fn()}
        branchName={branchName}
      />,
    );

    expect(screen.getByText("Gudang Pusat")).toBeInTheDocument();
    expect(screen.getByText("Jakarta")).toBeInTheDocument();
    expect(screen.getByText("Jl. Sudirman 1")).toBeInTheDocument();
    expect(screen.getByText("Budi")).toBeInTheDocument();
    expect(screen.getByText("021-555-1234")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("labels an unassigned warehouse as central rather than blank", () => {
    renderWithAuth(
      <WarehousesTable
        warehouses={[makeWarehouse({ defaultBranchId: null })]}
        loading={false}
        onChanged={jest.fn()}
        branchName={branchName}
      />,
    );

    expect(screen.getByText(/central \(no branch\)/i)).toBeInTheDocument();
  });

  it("shows the empty state when there are no warehouses", () => {
    renderWithAuth(
      <WarehousesTable
        warehouses={[]}
        loading={false}
        onChanged={jest.fn()}
        branchName={branchName}
      />,
    );
    expect(
      screen.getByText(/no warehouses match the current filters/i),
    ).toBeInTheDocument();
  });

  it("confirms and deletes a warehouse, then refetches", async () => {
    const remove = jest
      .spyOn(warehouseService, "remove")
      .mockResolvedValue({} as never);
    const onChanged = jest.fn();

    renderWithAuth(
      <WarehousesTable
        warehouses={[makeWarehouse()]}
        loading={false}
        onChanged={onChanged}
        branchName={branchName}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /delete/i }));

    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^delete$/i }),
    );

    expect(remove).toHaveBeenCalledWith("w1");
    expect(onChanged).toHaveBeenCalled();
  });

  it("surfaces the backend's reason when a delete is refused", async () => {
    // The 409 guard's actionable half arrives in `reason`, not `message` — the
    // dialog must show both or the user is told only that it failed.
    jest.spyOn(warehouseService, "remove").mockRejectedValue(
      new ApiError("Cannot delete warehouse", 409, {
        reason: "Warehouse still holds stock for 3 product(s).",
      }),
    );

    renderWithAuth(
      <WarehousesTable
        warehouses={[makeWarehouse()]}
        loading={false}
        onChanged={jest.fn()}
        branchName={branchName}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^delete$/i }),
    );

    expect(
      await within(dialog).findByText(/still holds stock for 3 product/i),
    ).toBeInTheDocument();
  });

  it("offers no delete for a branch's default warehouse", () => {
    // The backend refuses it unconditionally, so the button would only ever
    // produce a 409; the Default badge carries the explanation instead.
    renderWithAuth(
      <WarehousesTable
        warehouses={[makeWarehouse({ isDefault: true })]}
        loading={false}
        onChanged={jest.fn()}
        branchName={branchName}
      />,
    );

    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete/i }),
    ).not.toBeInTheDocument();
    // Editing one is still allowed — only the delete is refused.
    expect(screen.getByRole("link", { name: /edit/i })).toBeInTheDocument();
  });

  it("hides the Actions column when the role has no warehouse actions", () => {
    renderWithAuth(
      <WarehousesTable
        warehouses={[makeWarehouse()]}
        loading={false}
        onChanged={jest.fn()}
        branchName={branchName}
      />,
      {
        isSuperAdmin: false,
        permissions: [{ feature: "warehouses", actions: ["read"] }],
      },
    );

    expect(
      screen.queryByRole("columnheader", { name: /actions/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the Actions column when at least one action is permitted", () => {
    renderWithAuth(
      <WarehousesTable
        warehouses={[makeWarehouse()]}
        loading={false}
        onChanged={jest.fn()}
        branchName={branchName}
      />,
      {
        isSuperAdmin: false,
        permissions: [{ feature: "warehouses", actions: ["read", "update"] }],
      },
    );

    expect(
      screen.getByRole("columnheader", { name: /actions/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /edit/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete/i }),
    ).not.toBeInTheDocument();
  });

  it("offers restore for a deleted warehouse", () => {
    renderWithAuth(
      <WarehousesTable
        warehouses={[makeWarehouse({ deletedAt: "2026-02-01T00:00:00.000Z" })]}
        loading={false}
        onChanged={jest.fn()}
        branchName={branchName}
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
