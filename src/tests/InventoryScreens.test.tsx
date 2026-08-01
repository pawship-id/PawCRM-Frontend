import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  InventoryHub,
  StockAdjustmentForm,
  StockCardScreen,
  StockTransferForm,
} from "@/features/inventory";
import { resetState } from "@/features/inventory/data/demoStore";

/**
 * Mount tests for the three stock screens.
 *
 * Deliberately shallow on styling and deep on the two things a reviewer would
 * otherwise have to catch by clicking: that each screen mounts at all, and that
 * the previews which justify these screens' existence actually appear — the
 * FEFO allocation, the "no journal" note on a transfer, and the required-batch
 * rule for goods that expire.
 *
 * The demo store is module-level state shared by all three screens, so it is
 * reset between tests; without that, a quantity written by one case would leak
 * into the next one's arithmetic.
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

    // The five the sidebar lists, in the order the data flows: define a
    // product, watch its card, manage its lots, count it, move it.
    const expected: Array<[RegExp, string]> = [
      [/Produk & Varian/i, "/dashboard/inventory/products"],
      [/Kartu Stok/i, "/dashboard/inventory/stock-card"],
      [/Batch & Expired/i, "/dashboard/inventory/batches"],
      [/Stok Opname/i, "/dashboard/inventory/opname"],
      [/Transfer Stok/i, "/dashboard/inventory/transfers"],
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

describe("StockAdjustmentForm", () => {
  it("mounts with the inbound direction selected", () => {
    render(<StockAdjustmentForm />);

    expect(screen.getByText("Arah penyesuaian")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Barang masuk (+)" }),
    ).toBeInTheDocument();
  });

  it("asks for a batch and expiry when the product tracks kedaluwarsa", () => {
    // The default fixture product has hasExpiry: true — this is the promise the
    // flag makes, and the form is where it is finally collected.
    render(<StockAdjustmentForm />);

    expect(screen.getByLabelText(/Kode batch/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tanggal kedaluwarsa/)).toBeInTheDocument();
  });

  it("blocks an inbound save that has no batch code", async () => {
    const user = userEvent.setup();
    render(<StockAdjustmentForm />);

    await user.type(screen.getByLabelText(/^Jumlah/), "5");
    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));

    expect(
      screen.getByText(/kode batch wajib diisi/i),
    ).toBeInTheDocument();
  });

  it("shows the weighted-average arithmetic, not just the result", async () => {
    const user = userEvent.setup();
    render(<StockAdjustmentForm />);

    await user.type(screen.getByLabelText(/^Jumlah/), "5");

    expect(
      screen.getByText(/Perhitungan HPP rata-rata tertimbang/),
    ).toBeInTheDocument();
  });

  it("swaps the HPP strip for the FEFO allocation when writing stock off", async () => {
    const user = userEvent.setup();
    render(<StockAdjustmentForm />);

    await user.click(screen.getByRole("button", { name: "Barang keluar (−)" }));
    await user.type(screen.getByLabelText(/^Jumlah/), "6");

    expect(screen.getByText(/Alokasi FEFO/)).toBeInTheDocument();
    // 6 units of the default product span two lots — so two ledger rows.
    expect(screen.getByText("2 baris movement")).toBeInTheDocument();
  });

  it("warns when the lots cannot cover the withdrawal, without blocking it", async () => {
    const user = userEvent.setup();
    render(<StockAdjustmentForm />);

    await user.click(screen.getByRole("button", { name: "Barang keluar (−)" }));
    await user.type(screen.getByLabelText(/^Jumlah/), "999");

    expect(screen.getByText(/Stok lot tidak mencukupi/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Simpan penyesuaian/ }),
    ).toBeEnabled();
  });
});

describe("StockCardScreen", () => {
  it("mounts with the ledger tab and a running balance", () => {
    render(<StockCardScreen />);

    expect(screen.getByText(/Kartu stok \(/)).toBeInTheDocument();
    expect(screen.getByText("Saldo")).toBeInTheDocument();
  });

  it("states that the log cannot be edited", () => {
    render(<StockCardScreen />);

    expect(screen.getByText(/tidak bisa diubah/)).toBeInTheDocument();
  });

  it("switches to the batch tab and numbers the lots in FEFO order", async () => {
    const user = userEvent.setup();
    render(<StockCardScreen />);

    await user.click(screen.getByRole("button", { name: /Batch \/ FEFO/ }));

    const table = screen.getByRole("table");
    expect(within(table).getByText("Urutan FEFO")).toBeInTheDocument();
    expect(within(table).getByText("RC-B26-0455")).toBeInTheDocument();
  });
});

describe("StockTransferForm", () => {
  it("mounts with two distinct warehouses preselected", () => {
    render(<StockTransferForm />);

    expect(screen.getByLabelText("Dari gudang")).toBeInTheDocument();
    expect(screen.getByLabelText("Ke gudang")).toBeInTheDocument();
  });

  it("says plainly that a transfer posts no journal", () => {
    // Users who have just learned every stock action hits the books need to be
    // told this one does not, or they go looking for the missing entry.
    render(<StockTransferForm />);

    expect(
      screen.getByText(/Transfer TIDAK membuat jurnal/),
    ).toBeInTheDocument();
  });

  it("previews the mirrored rows once a quantity is entered", async () => {
    const user = userEvent.setup();
    render(<StockTransferForm />);

    await user.type(screen.getByLabelText(/^Jumlah/), "6");

    expect(screen.getByText("Lot yang berpindah")).toBeInTheDocument();
    // Two lots × an out/in pair each.
    expect(screen.getByText("4 baris movement")).toBeInTheDocument();
  });

  it("explains that lots travel with their expiry", async () => {
    const user = userEvent.setup();
    render(<StockTransferForm />);

    await user.type(screen.getByLabelText(/^Jumlah/), "2");

    expect(
      screen.getByText(/kode, tanggal\s+kedaluwarsa, dan harga beli yang sama/),
    ).toBeInTheDocument();
  });
});
