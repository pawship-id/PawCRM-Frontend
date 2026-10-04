import { screen } from "@testing-library/react";

import { StockModuleHeader } from "@/features/inventory";

import { renderWithAuth } from "./helpers/renderWithAuth";

const pathname = jest.fn(() => "/dashboard/inventory/stock-card");
jest.mock("next/navigation", () => ({
  usePathname: () => pathname(),
}));

/**
 * The head of the Stok module — a title and a tab row, and no tile row.
 *
 * The tiles the mockup draws for this module live on the Batch & Expired tab
 * instead, where `useBatchSummary` can scope them to the same branch and
 * warehouse as the rows underneath. A copy up here would report a tenant-wide
 * figure over a one-warehouse table, so the absence is the design and worth a
 * test of its own.
 */
beforeEach(() => {
  pathname.mockReturnValue("/dashboard/inventory/stock-card");
});

describe("StockModuleHeader", () => {
  it("draws the module's two tabs", () => {
    renderWithAuth(<StockModuleHeader />);

    expect(screen.getByRole("link", { name: "Kartu Stok" })).toHaveAttribute(
      "href",
      "/dashboard/inventory/stock-card",
    );
    expect(
      screen.getByRole("link", { name: "Batch & Expired" }),
    ).toHaveAttribute("href", "/dashboard/inventory/batches");
  });

  it("keeps the Kartu Stok tab lit on one product's card", () => {
    pathname.mockReturnValue("/dashboard/inventory/stock-card/507f1f");
    renderWithAuth(<StockModuleHeader />);

    expect(screen.getByRole("link", { name: "Kartu Stok" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Batch & Expired" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("marks the Batch & Expired tab when that is where the reader is", () => {
    pathname.mockReturnValue("/dashboard/inventory/batches");
    renderWithAuth(<StockModuleHeader />);

    expect(
      screen.getByRole("link", { name: "Batch & Expired" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: "Kartu Stok" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("drops the Batch & Expired tab for a role without the grant", () => {
    renderWithAuth(<StockModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "stockMovements", actions: ["read"] }],
    });

    expect(
      screen.getByRole("link", { name: "Kartu Stok" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Batch & Expired" }),
    ).not.toBeInTheDocument();
  });

  it("renders the tab's own control in the action slot", () => {
    // The Gudang selector is StockProductsScreen's, not the module's — the
    // header only makes room for it.
    renderWithAuth(<StockModuleHeader action={<button>Gudang</button>} />);

    expect(screen.getByRole("button", { name: "Gudang" })).toBeInTheDocument();
  });
});
