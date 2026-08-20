import { screen, within } from "@testing-library/react";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { StockEntryDetail } from "@/features/inventory";
import { stockEntryService } from "@/services/stockEntry.service";
import type { StockEntry } from "@/types/inventory";

jest.mock("@/services/stockEntry.service");

const asMock = <T,>(fn: T) => fn as unknown as jest.Mock;

/**
 * One hand-typed stock document, read.
 *
 * WHAT IS WORTH PINNING. The things this screen decides that nothing else does,
 * and each is wrong in a way a reader would believe:
 *
 *   TWO DATES, TOLD APART. `entryDate` is the day the correction BELONGS to and
 *   `createdAt` is the day it was typed. They differ whenever anything is
 *   entered late, and that gap is the first thing an audit asks about.
 *
 *   THE PRODUCT IS NAMED. The read populates it, and a screen showing "—" where
 *   a name belongs was the bug that put this file here.
 *
 *   THE LINE COUNT AND THE MOVEMENT COUNT DIFFER ON PURPOSE — that difference is
 *   FEFO, and unexplained it reads as a miscount.
 */
function entry(overrides: Partial<StockEntry> = {}): StockEntry {
  return {
    _id: "se1",
    kind: "adjustment",
    entryNumber: "ADJ-2026-0006",
    // Belongs to the 20th, typed on the 23rd — the gap this screen exists to
    // make visible.
    entryDate: "2026-08-20T00:00:00.000Z",
    branchId: { _id: "b1", name: "Cabang Selatan" },
    warehouseId: { _id: "w1", name: "Gudang Cabang Selatan" },
    notes: "Barang rusak kena air",
    lineCount: 1,
    movementIds: ["mv1"],
    journalEntryId: null,
    createdBy: { _id: "u1", name: "Rina" },
    createdAt: "2026-08-23T07:22:00.000Z",
    updatedAt: "2026-08-23T07:22:00.000Z",
    lines: [
      {
        productId: "p1",
        qty: "5.0000",
        systemQty: "0.0000",
        costPerUnit: "130000.0000",
        batchCostPerUnit: null,
        batchCode: "1234",
        expiryDate: "2026-08-22T00:00:00.000Z",
        batchId: null,
        isConsignment: false,
        productName: "Royal Canin Adult 3kg",
        productSku: "RC-3KG",
        productUnit: "sak",
      },
    ],
    ...overrides,
  } as StockEntry;
}

beforeEach(() => {
  jest.clearAllMocks();
  asMock(stockEntryService.getById).mockResolvedValue(entry());
});

it("reads the document its kind names", async () => {
  renderWithAuth(<StockEntryDetail id="se1" kind="adjustment" />);

  expect(await screen.findByText("ADJ-2026-0006")).toBeInTheDocument();
  expect(stockEntryService.getById).toHaveBeenCalledWith("se1", "adjustment");
});

/**
 * NAMED FOR WHAT IT DATES. The card carries a second date now, and two fields
 * called "Tanggal" is how a reader stops trusting either.
 */
it("names the date after the kind of document", async () => {
  renderWithAuth(<StockEntryDetail id="se1" kind="adjustment" />);
  expect(await screen.findByText("Tanggal penyesuaian")).toBeInTheDocument();

  asMock(stockEntryService.getById).mockResolvedValue(
    entry({ kind: "opening_balance", entryNumber: "OPB-2026-0001" }),
  );
  renderWithAuth(<StockEntryDetail id="se1" kind="opening_balance" />);
  expect(await screen.findByText("Tanggal stok awal")).toBeInTheDocument();
});

/**
 * THE GAP IS THE POINT. A document belonging to the 20th and typed on the 23rd
 * must say both, or "was this entered late" is unanswerable from the screen that
 * exists to answer it.
 */
it("shows when it happened and when it was typed", async () => {
  renderWithAuth(<StockEntryDetail id="se1" kind="adjustment" />);

  expect(await screen.findByText(/20 Agustus 2026/)).toBeInTheDocument();
  // The second is shorter and carries a time, so the two are told apart at a
  // glance rather than read twice.
  expect(screen.getByText(/23 Agu 2026/)).toBeInTheDocument();
});

/** Under the author, because who and when are one fact. */
it("puts the creation time under the author", async () => {
  renderWithAuth(<StockEntryDetail id="se1" kind="adjustment" />);

  const field = (await screen.findByText("Dibuat oleh")).closest("div");
  expect(within(field!).getByText("Rina")).toBeInTheDocument();
  expect(within(field!).getByText(/23 Agu 2026/)).toBeInTheDocument();
});

/**
 * Shown ALWAYS, not only when the two differ: a reader must be able to see they
 * agree rather than infer it from a line that is missing.
 */
it("shows the creation time even when it matches the document date", async () => {
  asMock(stockEntryService.getById).mockResolvedValue(
    entry({ createdAt: "2026-08-20T09:00:00.000Z" }),
  );

  renderWithAuth(<StockEntryDetail id="se1" kind="adjustment" />);

  expect(await screen.findByText(/20 Agu 2026/)).toBeInTheDocument();
});

/** The read populates the product; a "—" here was the bug that started this. */
it("names the product rather than pointing at it", async () => {
  renderWithAuth(<StockEntryDetail id="se1" kind="adjustment" />);

  expect(await screen.findByText("Royal Canin Adult 3kg")).toBeInTheDocument();
  expect(screen.getByText(/RC-3KG/)).toBeInTheDocument();
});

/**
 * NAMING A LOT AND CREATING ONE BOTH HAVE TO SHOW. A line that created a lot
 * carries its code and price itself; a line that named an existing one carries
 * only an id — the ordinary case for an adjustment — and the server fills the
 * rest in from the lot.
 */
it("shows a named lot's code and what it came in at", async () => {
  asMock(stockEntryService.getById).mockResolvedValue(
    entry({
      lines: [
        {
          productId: "p1",
          qty: "4.0000",
          systemQty: "1.0000",
          costPerUnit: null,
          batchCostPerUnit: "118500.0000",
          batchCode: "RC-B26",
          expiryDate: "2026-12-31T00:00:00.000Z",
          batchId: "b1",
          isConsignment: false,
          productName: "Royal Canin Adult 1kg",
          productSku: "RC-ADULT-1KG-BEEF",
          productUnit: "pcs",
        },
      ],
    } as Partial<StockEntry>),
  );

  renderWithAuth(<StockEntryDetail id="se1" kind="adjustment" />);

  const row = (await screen.findByText("Royal Canin Adult 1kg")).closest("tr");
  expect(within(row!).getByText("RC-B26")).toBeInTheDocument();
  expect(within(row!).getByText(/118\.500/)).toBeInTheDocument();
});

/**
 * AND IT SAYS WHICH IT IS SHOWING. A price typed on this document and a fact
 * about a batch already on the shelf are different things; one number for both
 * would leave a reader unable to tell them apart.
 */
it("marks a price that came from the lot rather than the document", async () => {
  asMock(stockEntryService.getById).mockResolvedValue(
    entry({
      lines: [
        {
          productId: "p1",
          qty: "4.0000",
          systemQty: "1.0000",
          costPerUnit: null,
          batchCostPerUnit: "118500.0000",
          batchCode: "RC-B26",
          expiryDate: null,
          batchId: "b1",
          isConsignment: false,
          productName: "Royal Canin Adult 1kg",
          productSku: "RC-ADULT-1KG-BEEF",
          productUnit: "pcs",
        },
      ],
    } as Partial<StockEntry>),
  );

  renderWithAuth(<StockEntryDetail id="se1" kind="adjustment" />);

  expect(await screen.findByText("dari batch")).toBeInTheDocument();
});

/** A price the user typed is shown plainly — it needs no provenance. */
it("shows a typed price without the lot caption", async () => {
  renderWithAuth(<StockEntryDetail id="se1" kind="adjustment" />);

  expect(await screen.findByText(/130\.000/)).toBeInTheDocument();
  expect(screen.queryByText("dari batch")).not.toBeInTheDocument();
});

/**
 * More movements than lines is FEFO, and the screen says so — unexplained, the
 * first reader to count the stock card reads it as a double posting.
 */
/**
 * EQUAL IS THE ORDINARY CASE AND SAYS NOTHING. Two badges holding the same
 * number is a question a reader stops to answer and gets nothing for.
 */
it("hides the movement count when it matches the line count", async () => {
  renderWithAuth(<StockEntryDetail id="se1" kind="adjustment" />);

  expect(await screen.findByText("1 baris")).toBeInTheDocument();
  expect(screen.queryByText(/pergerakan/)).not.toBeInTheDocument();
});

it("explains a movement count larger than the line count", async () => {
  asMock(stockEntryService.getById).mockResolvedValue(
    entry({ movementIds: ["mv1", "mv2", "mv3"] }),
  );

  renderWithAuth(<StockEntryDetail id="se1" kind="adjustment" />);

  expect(await screen.findByText("1 baris")).toBeInTheDocument();
  expect(screen.getByText("3 pergerakan")).toBeInTheDocument();
  expect(
    screen.getByText(/diambil dari beberapa batch sekaligus/),
  ).toBeInTheDocument();
});

/**
 * Null is ordinary, not missing: goods with no cost basis move a quantity and
 * not a value, and the ledger declines to post an entry worth nothing. Said, so
 * nobody hunts for a link that was never there.
 */
it("says why there is no journal rather than leaving a gap", async () => {
  renderWithAuth(<StockEntryDetail id="se1" kind="adjustment" />);

  expect(await screen.findByText(/belum punya HPP/)).toBeInTheDocument();
});
