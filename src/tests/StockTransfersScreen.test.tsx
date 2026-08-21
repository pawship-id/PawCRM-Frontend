import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { StockTransfersScreen } from "@/features/inventory";
import { stockMovementService } from "@/services/stockMovement.service";
import { warehouseService } from "@/services/warehouse.service";
import type { Warehouse } from "@/types/api";
import type {
  StockTransferPage,
  StockTransferSummary,
} from "@/types/inventory";

/**
 * The transfer list, against mocked services.
 *
 * WHAT THIS IS FOR. This route used to open onto the form, so the two things
 * worth pinning are the ones that change if somebody reverses that: the list
 * arrives grouped from the server — `listTransfers`, never the ledger filtered
 * to `transfer_manual`, which would page ROWS and split one transfer across two
 * pages — and the form is reachable from it.
 *
 * The third is the one number on the screen that can be misread: "Nilai" is the
 * cost of the goods that moved, and a transfer posts no journal. The footnote
 * saying so is asserted here because it is the only place a reader adding the
 * column up would find it.
 */
const WAREHOUSES: Warehouse[] = [
  { _id: "w1", name: "Gudang Pusat", defaultBranchId: null } as Warehouse,
  { _id: "w2", name: "Gudang Bazar", defaultBranchId: "b1" } as Warehouse,
];

const TRANSFER: StockTransferSummary = {
  transferId: "t1",
  transferredAt: "2026-08-15T02:00:00.000Z",
  fromWarehouseId: "w1",
  toWarehouseId: "w2",
  // Three lots for two products: one of them came off two shelves.
  productCount: 2,
  lotCount: 3,
  value: "450000.0000",
  notes: "persiapan bazar Sabtu",
  createdBy: "u1",
  fromWarehouseName: "Gudang Pusat",
  toWarehouseName: "Gudang Bazar",
  createdByName: "Rina",
};

function page(items: StockTransferSummary[] = []): StockTransferPage {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
  };
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest
    .spyOn(stockMovementService, "listTransfers")
    .mockResolvedValue(page([TRANSFER]));
  // Spied so the test below can assert it is NOT the one that gets called.
  jest.spyOn(stockMovementService, "list");
  jest.spyOn(warehouseService, "list").mockResolvedValue({
    items: WAREHOUSES,
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  });
});

it("opens on the list, with the form behind a button", async () => {
  renderWithAuth(<StockTransfersScreen />);

  const link = await screen.findByRole("link", { name: /Transfer baru/ });
  expect(link).toHaveAttribute("href", "/dashboard/inventory/transfers/new");
});

it("reads the grouped endpoint, not the ledger", async () => {
  renderWithAuth(<StockTransfersScreen />);

  // Grouping a page of ledger rows in the browser would page ROWS: one transfer
  // could straddle a boundary and be listed twice, each time with half its lots.
  await waitFor(() =>
    expect(stockMovementService.listTransfers).toHaveBeenCalled(),
  );
  expect(stockMovementService.list).not.toHaveBeenCalled();
});

it("shows both ends and what the transfer carried", async () => {
  renderWithAuth(<StockTransfersScreen />);

  const row = (await screen.findByText("Gudang Bazar")).closest("tr");
  expect(row).not.toBeNull();

  expect(within(row!).getByText("Gudang Pusat")).toBeInTheDocument();
  // What somebody typed. How many lots FEFO drew from to satisfy it is a fact
  // about the allocation, and it is on the detail beside the lots it counts.
  expect(within(row!).getByText("2")).toBeInTheDocument();
  expect(within(row!).getByText(/persiapan bazar Sabtu/)).toBeInTheDocument();
  // Who wrote it is on the detail too — a list of what moved is not a list of
  // who was on shift.
  expect(within(row!).queryByText("Rina")).not.toBeInTheDocument();
});

/**
 * THE VALUE IS NOT ON THIS SCREEN. A transfer's worth is a dozen products at
 * their own averages, and one figure in a cell can neither be checked nor traced
 * to a product without opening the row anyway — so it moved to the detail, a
 * line at a time, and the sentence keeping it from being read as a journal
 * figure went with it.
 */
it("carries no value column, and points at the detail instead", async () => {
  renderWithAuth(<StockTransfersScreen />);

  const row = (await screen.findByText("Gudang Bazar")).closest("tr");
  expect(within(row!).queryByText(/450\.000/)).not.toBeInTheDocument();
  expect(
    screen.getByText(/Buka Detail untuk melihat barang apa saja/),
  ).toBeInTheDocument();
});

/**
 * A transfer has no number to link from — it has no document — so the way in is
 * a named action rather than a linked date somebody has to try to discover.
 */
it("opens the transfer's own detail from the row's action", async () => {
  renderWithAuth(<StockTransfersScreen />);

  const link = await screen.findByRole("link", { name: /^Detail transfer/ });
  expect(link).toHaveAttribute(
    "href",
    `/dashboard/inventory/transfers/${TRANSFER.transferId}`,
  );
});

/**
 * THE MATCH, MARKED. The note is the only thing the server searches here, so a
 * row on screen is a row this cell explains — and a result with nothing on it
 * showing why it is a result is one a reader has to take on trust.
 */
it("marks the part of the note the search matched", async () => {
  const user = userEvent.setup();
  renderWithAuth(<StockTransfersScreen />);
  await screen.findByText(/persiapan bazar Sabtu/);

  await user.type(screen.getByLabelText("Cari transfer"), "bazar");

  const marked = await screen.findByText("bazar");
  expect(marked.tagName).toBe("MARK");
});

/**
 * THE CUT FOLLOWS THE MATCH. CSS truncation cuts from the end regardless of
 * where the term is, so a word in the middle of a long note would come back as
 * sixty characters that do not contain it.
 */
it("cuts a long note around the match rather than from the end", async () => {
  const long =
    "stok untuk bazar akhir bulan, diambil dari rak depan setelah opname " +
    "selesai dan sisanya ditinggal untuk penjualan harian di gudang pusat";
  jest
    .spyOn(stockMovementService, "listTransfers")
    .mockResolvedValue(page([{ ...TRANSFER, notes: long }]));

  const user = userEvent.setup();
  renderWithAuth(<StockTransfersScreen />);
  await screen.findByText(/stok untuk bazar/);

  await user.type(screen.getByLabelText("Cari transfer"), "penjualan");

  const marked = await screen.findByText("penjualan");
  expect(marked.tagName).toBe("MARK");
});

/** Opens the panel the two filters live behind. */
async function openPanel() {
  const user = userEvent.setup();
  renderWithAuth(<StockTransfersScreen />);
  await waitFor(() => expect(warehouseService.list).toHaveBeenCalled());
  await user.click(screen.getByRole("button", { name: "Filter" }));
  return user;
}

/**
 * BEHIND A BUTTON, AND WAITING FOR TERAPKAN. Two combined fields are what a
 * panel is for (§8) — the warehouse used to stand on the bar and apply on click,
 * which was right while it was the only one of them.
 */
it("narrows on the server when a warehouse is applied", async () => {
  const user = await openPanel();

  await user.click(screen.getByLabelText("Filter gudang — asal maupun tujuan"));
  await user.click(await screen.findByRole("option", { name: "Gudang Bazar" }));

  // Nothing is asked until Terapkan: that is what keeps a panel from re-querying
  // while somebody composes.
  expect(stockMovementService.listTransfers).not.toHaveBeenLastCalledWith(
    expect.objectContaining({ warehouseId: "w2" }),
  );

  await user.click(screen.getByRole("button", { name: "Terapkan" }));

  await waitFor(() =>
    expect(stockMovementService.listTransfers).toHaveBeenLastCalledWith(
      expect.objectContaining({ warehouseId: "w2" }),
    ),
  );
  // The badge is what pays back what the button conceals.
  expect(
    await screen.findByRole("button", { name: "Filter (1)" }),
  ).toBeInTheDocument();
});

/**
 * SORTING IS A FIELD IN THE PANEL, not a control of its own — and it leads the
 * stack, because it is the one field always set and the only one that changes
 * what the top of the list is rather than what is in it.
 */
it("asks the server for the ordering the panel picked", async () => {
  const user = await openPanel();

  await user.click(screen.getByLabelText("Urutkan"));
  await user.click(await screen.findByRole("option", { name: "Terlama" }));
  await user.click(screen.getByRole("button", { name: "Terapkan" }));

  await waitFor(() =>
    expect(stockMovementService.listTransfers).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "oldest" }),
    ),
  );
});

/**
 * NOT COUNTED IN THE BADGE. Every list has an ordering, so counting it would put
 * a standing number over an unnarrowed list and teach people to ignore the badge
 * — the one thing that makes a collapsed filter safe.
 */
it("leaves the ordering out of the filter count", async () => {
  const user = await openPanel();

  await user.click(screen.getByLabelText("Urutkan"));
  await user.click(await screen.findByRole("option", { name: "Terlama" }));
  await user.click(screen.getByRole("button", { name: "Terapkan" }));

  expect(
    await screen.findByRole("button", { name: "Filter" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Filter \(/ }),
  ).not.toBeInTheDocument();
});

it("keeps 'Semua gudang' on offer after a warehouse has been picked", async () => {
  const user = await openPanel();

  await user.click(screen.getByLabelText("Filter gudang — asal maupun tujuan"));
  await user.click(await screen.findByRole("option", { name: "Gudang Bazar" }));

  // The way back is in the list itself, so the choice is reversible without
  // reaching for Reset.
  await user.click(screen.getByLabelText("Filter gudang — asal maupun tujuan"));
  expect(
    within(screen.getByRole("listbox")).getByRole("option", {
      name: "Semua gudang",
    }),
  ).toBeInTheDocument();
});

/** Reset clears and re-queries in the same click — it never waits for Terapkan. */
it("re-queries unnarrowed on Reset", async () => {
  const user = await openPanel();

  await user.click(screen.getByLabelText("Filter gudang — asal maupun tujuan"));
  await user.click(await screen.findByRole("option", { name: "Gudang Bazar" }));
  await user.click(screen.getByRole("button", { name: "Terapkan" }));
  await waitFor(() =>
    expect(stockMovementService.listTransfers).toHaveBeenLastCalledWith(
      expect.objectContaining({ warehouseId: "w2" }),
    ),
  );

  await user.click(screen.getByRole("button", { name: "Filter (1)" }));
  await user.click(screen.getByRole("button", { name: "Reset" }));

  await waitFor(() =>
    expect(stockMovementService.listTransfers).toHaveBeenLastCalledWith(
      expect.objectContaining({ warehouseId: undefined, sort: "newest" }),
    ),
  );
});

it("offers the empty list its next step", async () => {
  jest.spyOn(stockMovementService, "listTransfers").mockResolvedValue(page());

  renderWithAuth(<StockTransfersScreen />);

  expect(await screen.findByText("Belum ada transfer")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Transfer baru/ }),
  ).toBeInTheDocument();
});

it("hides the create button from a role that may only read", async () => {
  renderWithAuth(<StockTransfersScreen />, {
    isSuperAdmin: false,
    permissions: [{ feature: "stockMovements", actions: ["read"] }],
  });

  // The list itself is gated on `read` by the page — the write is gated here and
  // on the /new route, so a reader still gets the history.
  await waitFor(() =>
    expect(stockMovementService.listTransfers).toHaveBeenCalled(),
  );
  expect(screen.queryByRole("link", { name: /Transfer baru/ })).toBeNull();
});
