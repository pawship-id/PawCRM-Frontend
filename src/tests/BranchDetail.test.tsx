import { screen, within } from "@testing-library/react";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { BranchDetail } from "@/features/branches/components/BranchDetail";
import { branchService } from "@/services/branch.service";
import { warehouseService } from "@/services/warehouse.service";
import type { Branch, Warehouse } from "@/types/api";

jest.mock("@/services/branch.service");
jest.mock("@/services/warehouse.service");

/**
 * Pengaturan › Cabang › one branch, read-only (28 September 2026).
 *
 * WHAT THIS SUITE IS REALLY GUARDING is the split it was built with: the
 * address shows a branch and never edits one, and the warehouses under it come
 * from a SECOND request that is allowed to fail on its own.
 */
function makeBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    _id: "br-1",
    tenantId: "t1",
    name: "Cabang Selatan",
    code: "CBS",
    address: "Jl. Contoh No. 1",
    city: "Jakarta Selatan",
    phone: "02177778888",
    receiptFooter: "Terima kasih sudah mampir!",
    openTime: "09:00",
    closeTime: "20:00",
    operatingDays: ["mon", "tue"],
    location: { lat: -6.2, lng: 106.8, source: "manual" },
    isActive: true,
    deletedAt: null,
    createdAt: "2026-09-01T02:00:00.000Z",
    updatedAt: "2026-09-20T02:00:00.000Z",
    ...overrides,
  };
}

function makeWarehouse(overrides: Partial<Warehouse> = {}): Warehouse {
  return {
    _id: "wh-1",
    tenantId: "t1",
    name: "Etalase Selatan",
    defaultBranchId: "br-1",
    address: "Jl. Contoh No. 1",
    location: { lat: null, lng: null, source: "manual" },
    picName: "Budi",
    picPhone: "0812",
    isActive: true,
    isDefault: false,
    hasPos: true,
    deletedAt: null,
    createdAt: "2026-09-01T02:00:00.000Z",
    updatedAt: "2026-09-01T02:00:00.000Z",
    ...overrides,
  };
}

function listReturns(items: Warehouse[]) {
  jest.mocked(warehouseService.list).mockResolvedValue({
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(branchService.getById).mockResolvedValue(makeBranch());
  listReturns([makeWarehouse()]);
});

describe("BranchDetail", () => {
  it("shows the branch's own facts, without a single input", async () => {
    renderWithAuth(<BranchDetail id="br-1" />);

    expect(await screen.findByText("CBS")).toBeInTheDocument();
    expect(screen.getByText("Jl. Contoh No. 1")).toBeInTheDocument();
    expect(screen.getByText("Jakarta Selatan")).toBeInTheDocument();
    expect(screen.getByText("Terima kasih sudah mampir!")).toBeInTheDocument();
    expect(screen.getByText("-6.2, 106.8")).toBeInTheDocument();

    // The whole point of the address: it reads, it never writes.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Simpan/i }),
    ).not.toBeInTheDocument();
  });

  it("lists the warehouses filed under this branch, badging tills and defaults", async () => {
    listReturns([
      makeWarehouse(),
      makeWarehouse({
        _id: "wh-2",
        name: "Gudang Cabang Selatan",
        isDefault: true,
        hasPos: false,
        picName: null,
        picPhone: null,
      }),
      makeWarehouse({
        _id: "wh-3",
        name: "Gudang Selatan",
        hasPos: false,
        isActive: false,
      }),
    ]);

    renderWithAuth(<BranchDetail id="br-1" />);

    expect(await screen.findByText("3 gudang · 1 punya kasir")).toBeInTheDocument();

    // Asked of the warehouses, scoped to this branch — not filtered client-side.
    expect(warehouseService.list).toHaveBeenCalledWith(
      expect.objectContaining({ defaultBranchId: "br-1" }),
    );

    const till = screen.getByText("Etalase Selatan").closest("li")!;
    expect(within(till).getByText("Kasir")).toBeInTheDocument();

    const seeded = screen.getByText("Gudang Cabang Selatan").closest("li")!;
    expect(within(seeded).getByText("Bawaan cabang")).toBeInTheDocument();
    expect(within(seeded).getByText("PIC belum diisi")).toBeInTheDocument();

    /*
      A RETIRED WAREHOUSE IS BADGED, NOT DROPPED: it still holds this branch's
      stock, so leaving it out would understate the place.
    */
    const retired = screen.getByText("Gudang Selatan").closest("li")!;
    expect(within(retired).getByText("Nonaktif")).toBeInTheDocument();
  });

  it("keeps the branch readable when the warehouse list fails", async () => {
    jest.mocked(warehouseService.list).mockRejectedValue(new Error("nope"));

    renderWithAuth(<BranchDetail id="br-1" />);

    expect(await screen.findByText("CBS")).toBeInTheDocument();
    expect(
      await screen.findByText("Daftar gudang tidak bisa dimuat."),
    ).toBeInTheDocument();
  });

  it("offers Ubah only to a role that may update, and never asks for warehouses it may not read", async () => {
    renderWithAuth(<BranchDetail id="br-1" />, {
      isSuperAdmin: false,
      permissions: [{ feature: "branches", actions: ["read"] }],
    });

    expect(await screen.findByText("CBS")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Ubah cabang/ }),
    ).not.toBeInTheDocument();
    expect(warehouseService.list).not.toHaveBeenCalled();
  });

  it("points Ubah at the edit page, which is a separate address", async () => {
    renderWithAuth(<BranchDetail id="br-1" />);

    expect(
      await screen.findByRole("link", { name: /Ubah cabang/ }),
    ).toHaveAttribute("href", "/dashboard/pengaturan/cabang/br-1/edit");
  });

  /*
    A BRANCH WITH NO CODE CANNOT ISSUE AN INVOICE — the API refuses and names
    it — so the gap is called out rather than drawn as an empty dash.
  */
  it("warns when the branch has no code", async () => {
    jest.mocked(branchService.getById).mockResolvedValue(
      makeBranch({ code: null }),
    );

    renderWithAuth(<BranchDetail id="br-1" />);

    expect(
      await screen.findByText(/belum bisa menerbitkan faktur/i),
    ).toBeInTheDocument();
  });

  it("says so when the branch itself cannot be loaded", async () => {
    jest.mocked(branchService.getById).mockRejectedValue(new Error("boom"));

    renderWithAuth(<BranchDetail id="br-1" />);

    expect(
      await screen.findByText("Data cabang ini tidak bisa dimuat."),
    ).toBeInTheDocument();
  });
});
