import { screen, waitFor } from "@testing-library/react";

import { GeneralSettingsScreen, InitialDataScreen } from "@/features/settings";
import { branchService } from "@/services/branch.service";
import { customerService } from "@/services/customer.service";
import { productService } from "@/services/product.service";
import { stockEntryService } from "@/services/stockEntry.service";
import { supplierService } from "@/services/supplier.service";
import { warehouseService } from "@/services/warehouse.service";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/branch.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/product.service");
jest.mock("@/services/stockEntry.service");
jest.mock("@/services/supplier.service");
jest.mock("@/services/warehouse.service");

/**
 * The two Pengaturan screens the mockup asks for.
 *
 * WHAT THESE TESTS ARE FOR. Both screens are mostly copy, and copy does not earn
 * a suite — but three things here are logic, and each one fails silently:
 *
 *  1. a count that has not arrived must not read as "belum ada", which is a
 *     different and alarming answer;
 *  2. a step is "selesai" only above zero, and the wording carries the figure
 *     rather than claiming a completeness nobody recorded;
 *  3. a role without a grant issues NO request for the number it would not be
 *     shown — the screens are ungated, so this is what keeps them from painting
 *     403s across a settings page.
 */
function totalling(total: number) {
  return { items: [], pagination: { page: 1, limit: 1, total, totalPages: 1 } };
}

function everythingCounts() {
  jest.mocked(branchService.list).mockResolvedValue(totalling(4));
  jest.mocked(warehouseService.list).mockResolvedValue(totalling(6));
  jest.mocked(productService.list).mockResolvedValue(totalling(248));
  jest.mocked(customerService.list).mockResolvedValue(totalling(412));
  jest.mocked(supplierService.list).mockResolvedValue(totalling(9));
  jest.mocked(stockEntryService.list).mockResolvedValue(totalling(2));
}

beforeEach(() => {
  everythingCounts();
});

describe("GeneralSettingsScreen", () => {
  it("links the three settings that exist and badges the four that do not", async () => {
    renderWithAuth(<GeneralSettingsScreen />);

    expect(screen.getByRole("link", { name: /Profil tenant/ })).toHaveAttribute(
      "href",
      "/dashboard/business",
    );
    expect(screen.getByRole("link", { name: /Cabang/ })).toHaveAttribute(
      "href",
      "/dashboard/master/branches",
    );
    expect(screen.getByRole("link", { name: /Gudang/ })).toHaveAttribute(
      "href",
      "/dashboard/master/warehouses",
    );

    // Drawn, so the shape of the module is visible — but they go nowhere.
    expect(screen.getAllByText("Segera")).toHaveLength(4);
    expect(
      screen.queryByRole("link", { name: /Notifikasi/ }),
    ).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("4 cabang")).toBeInTheDocument(),
    );
    expect(screen.getByText("6 gudang")).toBeInTheDocument();
  });

  it("costs two queries, not six", async () => {
    renderWithAuth(<GeneralSettingsScreen />);

    await waitFor(() =>
      expect(screen.getByText("4 cabang")).toBeInTheDocument(),
    );
    // The hook serves both screens; this one renders two figures and must ask
    // for exactly those.
    expect(productService.list).not.toHaveBeenCalled();
    expect(customerService.list).not.toHaveBeenCalled();
    expect(stockEntryService.list).not.toHaveBeenCalled();
  });

  it("drops a card, and its query, for a role without the grant", async () => {
    renderWithAuth(<GeneralSettingsScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "branches", actions: ["read"] }],
    });

    await waitFor(() =>
      expect(screen.getByText("4 cabang")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("link", { name: /Profil tenant/ }),
    ).not.toBeInTheDocument();
    expect(warehouseService.list).not.toHaveBeenCalled();
  });
});

describe("InitialDataScreen", () => {
  it("reports what was counted rather than claiming completeness", async () => {
    renderWithAuth(<InitialDataScreen />);

    await waitFor(() =>
      expect(screen.getByText("selesai · 248 produk")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("selesai · 4 cabang · 6 gudang"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("selesai · 412 pelanggan · 9 supplier"),
    ).toBeInTheDocument();
    expect(screen.getByText("selesai · 2 dokumen")).toBeInTheDocument();
  });

  it("says 'belum ada' only at zero, never while the answer is in flight", async () => {
    jest.mocked(productService.list).mockResolvedValue(totalling(0));
    renderWithAuth(<InitialDataScreen />);

    // Before anything resolves the step reads as pending, not as empty.
    expect(screen.queryByText("belum ada")).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("belum ada")).toBeInTheDocument(),
    );
  });

  it("locks the three steps whose screens do not exist", async () => {
    renderWithAuth(<InitialDataScreen />);

    expect(screen.getAllByText("Segera")).toHaveLength(3);
    expect(screen.getByText("menunggu langkah di atas")).toBeInTheDocument();
    // No way in, because there is nowhere to go.
    expect(
      screen.queryByRole("link", { name: /Saldo awal/ }),
    ).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("selesai · 248 produk")).toBeInTheDocument(),
    );
  });

  it("asks for nothing a role may not read, and says so on the step", async () => {
    renderWithAuth(<InitialDataScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "branches", actions: ["read"] }],
    });

    // Branches only: the gudang half of the first step drops out rather than
    // asking an endpoint this role would be refused by.
    await waitFor(() =>
      expect(screen.getByText("selesai · 4 cabang")).toBeInTheDocument(),
    );
    expect(screen.getAllByText("tidak bisa dilihat")).toHaveLength(3);
    expect(warehouseService.list).not.toHaveBeenCalled();
    expect(productService.list).not.toHaveBeenCalled();
    expect(customerService.list).not.toHaveBeenCalled();
  });
});
