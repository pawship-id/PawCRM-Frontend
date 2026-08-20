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

it("shows both ends and both counts", async () => {
  renderWithAuth(<StockTransfersScreen />);

  const row = (await screen.findByText("Gudang Bazar")).closest("tr");
  expect(row).not.toBeNull();

  expect(within(row!).getByText("Gudang Pusat")).toBeInTheDocument();
  // The two counts differ on purpose — that difference IS what says FEFO drew
  // one of the products off more than one shelf.
  expect(within(row!).getByText("2")).toBeInTheDocument();
  expect(within(row!).getByText("3")).toBeInTheDocument();
  expect(within(row!).getByText(/persiapan bazar Sabtu/)).toBeInTheDocument();
  expect(within(row!).getByText("Rina")).toBeInTheDocument();
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
    screen.getByText(/Buka tanggalnya untuk melihat barang apa saja/),
  ).toBeInTheDocument();
});

/** A transfer has no number to link from — it has no document — so the date carries it. */
it("links the date to the transfer's own detail", async () => {
  renderWithAuth(<StockTransfersScreen />);

  const link = await screen.findByRole("link", { name: /Agu|Agt|20/ });
  expect(link).toHaveAttribute(
    "href",
    `/dashboard/inventory/transfers/${TRANSFER.transferId}`,
  );
});

it("narrows on the server when a warehouse is picked", async () => {
  const user = userEvent.setup();
  renderWithAuth(<StockTransfersScreen />);

  await waitFor(() => expect(warehouseService.list).toHaveBeenCalled());
  await user.click(screen.getByRole("button", { name: /Filter gudang/ }));
  await user.click(screen.getByRole("option", { name: "Gudang Bazar" }));

  // A single select standing on the bar applies on click — no Terapkan.
  await waitFor(() =>
    expect(stockMovementService.listTransfers).toHaveBeenLastCalledWith(
      expect.objectContaining({ warehouseId: "w2" }),
    ),
  );
});

it("keeps 'Semua gudang' on offer after a warehouse has been picked", async () => {
  const user = userEvent.setup();
  renderWithAuth(<StockTransfersScreen />);

  await waitFor(() => expect(warehouseService.list).toHaveBeenCalled());
  await user.click(screen.getByRole("button", { name: /Filter gudang/ }));
  await user.click(screen.getByRole("option", { name: "Gudang Bazar" }));

  // The way back is in the list itself, so the choice is reversible without a
  // Reset the bar does not have.
  await user.click(screen.getByRole("button", { name: /Filter gudang/ }));
  expect(
    within(screen.getByRole("listbox")).getByRole("option", {
      name: "Semua gudang",
    }),
  ).toBeInTheDocument();
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
