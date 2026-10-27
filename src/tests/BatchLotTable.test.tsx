import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BatchLotTable } from "@/features/inventory/components/BatchLotTable";
import type { ProductBatch } from "@/types/inventory";

/**
 * The stock card's lot tab — Batch per Produk (FEFO).
 *
 * THE ONE INVENTORY TABLE THAT SORTS IN THE BROWSER (BO, 19 October 2026): it
 * is not paged — the card loads every lot (up to 100) at once — so a client sort
 * orders the whole set. What these guard:
 *
 *  1. the default is today's order: live lots in the API's FEFO order, then the
 *     spent ones;
 *  2. a header reorders the rows, and the FEFO NUMBER STAYS WITH ITS LOT — it
 *     is the pick order, not the row's position;
 *  3. undated lots sort last by expiry, whichever way;
 *  4. a cut list still says it was cut.
 */
function lot(overrides: Partial<ProductBatch>): ProductBatch {
  return {
    _id: "x",
    tenantId: "t1",
    warehouseId: "wh1",
    productId: "p1",
    receiptId: null,
    batchCode: "X-0",
    supplierBatchCode: null,
    expiryDate: null,
    initialQty: "10.0000",
    qtyRemaining: "1.0000",
    costPerUnit: "1000.0000",
    isConsignment: false,
    createdBy: null,
    createdAt: "",
    updatedAt: "",
    productName: "Royal Canin Adult 3kg",
    productSku: "RC-3KG",
    productUnit: "sak",
    productSellPrice: null,
    warehouseName: "Gudang Pusat",
    ...overrides,
  };
}

/**
 * In the API's order — soonest expiry first, undated last — with the spent lot
 * mixed in, as the API returns it. Values (sisa × harga): B-10 5.000, B-2
 * 9.000, C-3 2.000, A-1 0.
 */
const LOTS: ProductBatch[] = [
  lot({
    _id: "b10",
    batchCode: "B-10",
    expiryDate: "2026-11-01T00:00:00.000Z",
    qtyRemaining: "5.0000",
    costPerUnit: "1000.0000",
  }),
  lot({
    _id: "a1",
    batchCode: "A-1",
    expiryDate: null,
    qtyRemaining: "0.0000",
    costPerUnit: "500.0000",
  }),
  lot({
    _id: "b2",
    batchCode: "B-2",
    expiryDate: "2026-12-01T00:00:00.000Z",
    qtyRemaining: "1.0000",
    costPerUnit: "9000.0000",
  }),
  lot({
    _id: "c3",
    batchCode: "C-3",
    expiryDate: null,
    qtyRemaining: "20.0000",
    costPerUnit: "100.0000",
  }),
];

function renderTable(batches = LOTS, total = batches.length) {
  render(<BatchLotTable batches={batches} total={total} hasExpiry />);
}

/** Each body row as `code:fefo`, top to bottom — e.g. `B-10:1`, `A-1:habis`. */
function rowsOnScreen(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => {
      const cells = within(row).getAllByRole("cell");
      return `${within(cells[1]).getByText(/^[A-Z]-\d+$/).textContent}:${cells[0].textContent}`;
    });
}

describe("BatchLotTable", () => {
  it("opens in FEFO order: live lots numbered, spent ones after them", () => {
    renderTable();

    expect(rowsOnScreen()).toEqual(["B-10:1", "B-2:2", "C-3:3", "A-1:habis"]);
    expect(
      screen.getByRole("columnheader", { name: "Urutan FEFO" }),
    ).toHaveAttribute("aria-sort", "ascending");
  });

  it("reorders by value and keeps each lot's FEFO number", async () => {
    const user = userEvent.setup();
    renderTable();

    // Largest first on the first click, like every amount column.
    await user.click(screen.getByRole("button", { name: "Nilai sisa" }));

    expect(rowsOnScreen()).toEqual(["B-2:2", "B-10:1", "C-3:3", "A-1:habis"]);
    expect(
      screen.getByRole("columnheader", { name: "Nilai sisa" }),
    ).toHaveAttribute("aria-sort", "descending");
  });

  it("reverses the FEFO order on a click of its own header", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: "Urutan FEFO" }));

    expect(rowsOnScreen()).toEqual(["A-1:habis", "C-3:3", "B-2:2", "B-10:1"]);
  });

  it("sorts by expiry with undated lots last, both ways", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: "Kedaluwarsa" }));
    // Undated ties keep their FEFO order: C-3 (live) before A-1 (spent).
    expect(rowsOnScreen()).toEqual(["B-10:1", "B-2:2", "C-3:3", "A-1:habis"]);

    await user.click(screen.getByRole("button", { name: "Kedaluwarsa" }));
    expect(rowsOnScreen()).toEqual(["B-2:2", "B-10:1", "C-3:3", "A-1:habis"]);
  });

  it("sorts lot codes naturally, A first", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: "Kode batch internal" }));

    // B-2 before B-10: a code is read as a sequence, not character by character.
    expect(rowsOnScreen()).toEqual(["A-1:habis", "B-2:2", "B-10:1", "C-3:3"]);
  });

  it("sorts by remaining stock and by purchase price, largest first", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: "Sisa stok" }));
    expect(rowsOnScreen()).toEqual(["C-3:3", "B-10:1", "B-2:2", "A-1:habis"]);

    await user.click(screen.getByRole("button", { name: "Harga beli batch" }));
    expect(rowsOnScreen()).toEqual(["B-2:2", "B-10:1", "A-1:habis", "C-3:3"]);
  });

  it("says when the list was cut, and that the sort covers what is shown", () => {
    renderTable(LOTS, 140);

    expect(
      screen.getByText(/Menampilkan 4 batch pertama dari 140/),
    ).toBeInTheDocument();
  });

  it("explains an empty list instead of drawing an empty table", () => {
    render(<BatchLotTable batches={[]} total={0} hasExpiry search="rusak" />);

    expect(
      screen.getByText('Tidak ada batch dengan kode "rusak"'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Menampilkan/)).not.toBeInTheDocument();
  });
});
