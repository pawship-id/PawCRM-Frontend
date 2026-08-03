import { render, screen } from "@testing-library/react";

import { InventoryHub } from "@/features/inventory";
import { resetState } from "@/features/inventory/data/demoStore";

/**
 * Mount tests for the inventory screens still backed by the demo store.
 *
 * That is now the hub alone. The stock card, the adjustment form and the
 * transfer form all read and write the real API, so they need mocked services
 * and none of the setup here applies to them — see StockCardScreen.test.tsx and
 * StockMovementForms.test.tsx.
 *
 * The demo store is module-level state, so it is reset between tests.
 */
beforeEach(() => {
  resetState();
});

describe("InventoryHub", () => {
  it("mounts and surfaces the two questions worth acting on today", () => {
    render(<InventoryHub />);

    expect(
      screen.getByRole("heading", { name: "Inventory" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Perlu restock")).toBeInTheDocument();
    expect(screen.getByText("Mendekati kedaluwarsa")).toBeInTheDocument();
  });

  it("links to every screen in the Inventory dropdown", () => {
    render(<InventoryHub />);

    // The same screens the sidebar lists, in the order the data flows: define a
    // product, watch its card, manage its lots, count it, move it, correct it.
    const expected: Array<[RegExp, string]> = [
      [/Produk & Varian/i, "/dashboard/inventory/products"],
      [/Kartu Stok/i, "/dashboard/inventory/stock-card"],
      [/Batch & Expired/i, "/dashboard/inventory/batches"],
      [/Stok Opname/i, "/dashboard/inventory/opname"],
      [/Transfer Stok/i, "/dashboard/inventory/transfers"],
      [/Penyesuaian cepat/i, "/dashboard/inventory/adjustments"],
    ];

    for (const [name, href] of expected) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("marks itself as prototype data rather than passing fixtures off as real", () => {
    render(<InventoryHub />);

    expect(screen.getByText(/Prototype · data contoh/)).toBeInTheDocument();
  });
});
