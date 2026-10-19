import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { StockTransfersScreen } from "@/features/inventory";
import { stockMovementService } from "@/services/stockMovement.service";
import { stockTransferService } from "@/services/stockTransfer.service";
import { warehouseService } from "@/services/warehouse.service";
import type { User, Warehouse } from "@/types/api";
import type {
  StockTransferPage,
  StockTransferSummary,
} from "@/types/inventory";

/**
 * The transfer list, against mocked services.
 *
 * WHAT IS WORTH PINNING. A transfer is a numbered document with a status, so the
 * things that would silently change if somebody reverted that are:
 *
 *   THE NUMBER AND THE STATUS ARE ON THE ROW. They are what a storekeeper looks
 *   a transfer up by, and "Belum diterima" is the word that says the goods are
 *   still on the road.
 *
 *   THE LIST COMES FROM THE DOCUMENTS (`stockTransferService`), never from the
 *   ledger filtered to `transfer_manual`: an edited transfer has superseded
 *   postings in the ledger, and a list built from rows would show them as
 *   transfers of their own.
 *
 *   THE VALUE IS NOT HERE. A transfer's worth is a dozen products at their own
 *   averages, and one figure in a cell can be neither checked nor traced.
 */
const WAREHOUSES: Warehouse[] = [
  { _id: "w1", name: "Gudang Pusat", defaultBranchId: null } as Warehouse,
  { _id: "w2", name: "Gudang Bazar", defaultBranchId: "b1" } as Warehouse,
];

const TRANSFER: StockTransferSummary = {
  _id: "t1",
  transferNumber: "TRF/2610/0042",
  status: "in_transit",
  legacy: false,
  revision: 0,
  transferDate: "2026-08-15T02:00:00.000Z",
  fromWarehouseId: "w1",
  toWarehouseId: "w2",
  // Three lots for two products: one of them came off two shelves.
  productCount: 2,
  lotCount: 3,
  value: "450000.0000",
  notes: "persiapan bazar Sabtu",
  createdBy: "u1",
  createdAt: "2026-08-15T02:00:00.000Z",
  receivedAt: null,
  cancelledAt: null,
  fromWarehouseName: "Gudang Pusat",
  toWarehouseName: "Gudang Bazar",
  createdByName: "Rina",
  receivedByName: null,
  cancelledByName: null,
};

function page(items: StockTransferSummary[] = []): StockTransferPage {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
  };
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(stockTransferService, "list").mockResolvedValue(page([TRANSFER]));
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

it("reads the transfer documents, not the ledger", async () => {
  renderWithAuth(<StockTransfersScreen />);

  // An edited transfer leaves superseded postings in the ledger; a list built
  // from rows would show each revision as a transfer of its own.
  await waitFor(() => expect(stockTransferService.list).toHaveBeenCalled());
  expect(stockMovementService.list).not.toHaveBeenCalled();
});

it("leads each row with the number and says where the goods are", async () => {
  renderWithAuth(<StockTransfersScreen />);

  const row = (await screen.findByText("TRF/2610/0042")).closest("tr");
  expect(row).not.toBeNull();

  // The word, not a colour: "Belum diterima" is the state the goods are on the
  // road and the transfer can still be corrected.
  expect(within(row!).getByText("Belum diterima")).toBeInTheDocument();
});

it("says Diterima and Dibatalkan for the other two states", async () => {
  jest.spyOn(stockTransferService, "list").mockResolvedValue(
    page([
      {
        ...TRANSFER,
        _id: "t2",
        transferNumber: "TRF/2610/0043",
        status: "received",
      },
      {
        ...TRANSFER,
        _id: "t3",
        transferNumber: "TRF/2610/0044",
        status: "cancelled",
      },
    ]),
  );

  renderWithAuth(<StockTransfersScreen />);

  expect(await screen.findByText("Diterima")).toBeInTheDocument();
  expect(screen.getByText("Dibatalkan")).toBeInTheDocument();
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
it("carries no value column, and no sub text pointing at the detail", async () => {
  renderWithAuth(<StockTransfersScreen />);

  const row = (await screen.findByText("Gudang Bazar")).closest("tr");
  expect(within(row!).queryByText(/450\.000/)).not.toBeInTheDocument();
  // The line under the table is gone (BO, 19 October 2026).
  expect(
    screen.queryByText(/Buka Detail untuk melihat barang apa saja/),
  ).not.toBeInTheDocument();
});

/**
 * The number is the link, and a named action sits beside it — the action says
 * where it goes without the reader having to try the number to find out.
 */
it("opens the transfer's own detail from the row's kebab", async () => {
  const user = userEvent.setup();
  renderWithAuth(<StockTransfersScreen />);

  await user.click(
    await screen.findByRole("button", {
      name: `Aksi untuk ${TRANSFER.transferNumber}`,
    }),
  );
  const link = await screen.findByRole("menuitem", { name: "Detail" });
  expect(link).toHaveAttribute(
    "href",
    `/dashboard/inventory/transfers/${TRANSFER._id}`,
  );
});

/**
 * THE MATCH, MARKED. The note and the number are what the server searches, so a
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
    .spyOn(stockTransferService, "list")
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
  expect(stockTransferService.list).not.toHaveBeenLastCalledWith(
    expect.objectContaining({ warehouseId: "w2" }),
  );

  await user.click(screen.getByRole("button", { name: "Terapkan" }));

  await waitFor(() =>
    expect(stockTransferService.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ warehouseId: "w2" }),
    ),
  );
  // The badge is what pays back what the button conceals.
  expect(
    await screen.findByRole("button", { name: "Filter (1)" }),
  ).toBeInTheDocument();
});

/**
 * "BELUM DITERIMA" IS A LENS AS WELL AS A LABEL: the receiving warehouse's
 * to-do is what has been sent to it and is not there yet. It goes to the server
 * for the reason every filter here does — a list pages at twenty.
 */
it("narrows to what is still on the road", async () => {
  const user = await openPanel();

  await user.click(screen.getByLabelText("Filter status transfer"));
  await user.click(
    await screen.findByRole("option", { name: "Belum diterima" }),
  );
  await user.click(screen.getByRole("button", { name: "Terapkan" }));

  await waitFor(() =>
    expect(stockTransferService.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "in_transit" }),
    ),
  );
  expect(
    await screen.findByRole("button", { name: "Filter (1)" }),
  ).toBeInTheDocument();
});

/**
 * THE LIST SORTS FROM ITS COLUMN HEADERS (BO, 19 October 2026), on the server.
 * The first click takes the column's natural direction — newest date and most
 * products first, A first for a number, a warehouse, a status or a note.
 */
describe("header sorting", () => {
  async function renderList() {
    const user = userEvent.setup();
    renderWithAuth(<StockTransfersScreen />);
    await waitFor(() => expect(stockTransferService.list).toHaveBeenCalled());
    return user;
  }

  function lastSort() {
    const calls = (stockTransferService.list as jest.Mock).mock.calls;
    return calls[calls.length - 1][0].sort;
  }

  it("opens on the newest first, marked on the Tanggal header", async () => {
    await renderList();

    expect(lastSort()).toBe("newest");
    expect(
      screen.getByRole("columnheader", { name: "Tanggal" }),
    ).toHaveAttribute("aria-sort", "descending");
  });

  it.each([
    ["No. transfer", "numberAsc"],
    ["Tanggal", "oldest"],
    ["Produk", "productCountDesc"],
  ])("asks the server to sort by %s", async (header, sort) => {
    const user = await renderList();

    await user.click(screen.getByRole("button", { name: header }));

    await waitFor(() => expect(lastSort()).toBe(sort));
  });

  it("flips a column on the second click", async () => {
    const user = await renderList();

    await user.click(screen.getByRole("button", { name: "No. transfer" }));
    await waitFor(() => expect(lastSort()).toBe("numberAsc"));
    await user.click(screen.getByRole("button", { name: "No. transfer" }));

    await waitFor(() => expect(lastSort()).toBe("numberDesc"));
  });

  it("leaves Dari, Ke, Status, Catatan and Aksi plain", async () => {
    await renderList();

    for (const name of ["Dari", "Ke", "Status", "Catatan", "Aksi"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  /** Urutkan left the panel when the headers took over. */
  it("offers no Urutkan in the filter panel", async () => {
    const user = await openPanel();

    expect(screen.getByLabelText("Filter status transfer")).toBeVisible();
    expect(screen.queryByLabelText("Urutkan")).not.toBeInTheDocument();
    void user;
  });
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
    expect(stockTransferService.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ warehouseId: "w2" }),
    ),
  );

  await user.click(screen.getByRole("button", { name: "Filter (1)" }));
  await user.click(screen.getByRole("button", { name: "Reset" }));

  await waitFor(() =>
    expect(stockTransferService.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ warehouseId: undefined, sort: "newest" }),
    ),
  );
});

/**
 * A Reset inside a filter panel must not silently re-sort a table somebody
 * ordered from the headers it can see.
 */
it("keeps the header ordering through the panel's Reset", async () => {
  const user = userEvent.setup();
  renderWithAuth(<StockTransfersScreen />);
  await waitFor(() => expect(warehouseService.list).toHaveBeenCalled());

  await user.click(screen.getByRole("button", { name: "Produk" }));
  await waitFor(() =>
    expect(stockTransferService.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "productCountDesc" }),
    ),
  );

  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.click(screen.getByLabelText("Filter gudang — asal maupun tujuan"));
  await user.click(await screen.findByRole("option", { name: "Gudang Bazar" }));
  await user.click(screen.getByRole("button", { name: "Terapkan" }));
  await user.click(await screen.findByRole("button", { name: "Filter (1)" }));
  await user.click(screen.getByRole("button", { name: "Reset" }));

  await waitFor(() =>
    expect(stockTransferService.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        warehouseId: undefined,
        sort: "productCountDesc",
      }),
    ),
  );
});

it("offers the empty list its next step", async () => {
  jest.spyOn(stockTransferService, "list").mockResolvedValue(page());

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
  await waitFor(() => expect(stockTransferService.list).toHaveBeenCalled());
  expect(screen.queryByRole("link", { name: /Transfer baru/ })).toBeNull();
});

/**
 * Stock isolation on the transfer filter.
 *
 * A COURTESY OVER THE SERVER'S ANSWER — the API narrows the list and refuses an
 * out-of-scope filter with a 403 whatever this picker offers.
 */
describe("stock isolation", () => {
  it("offers only the warehouses the user may reach", async () => {
    // Confined to b1, so Gudang Bazar is in reach. Gudang Pusat has no branch
    // of its own, which makes it shared — it comes with any branch at all.
    const confined = {
      _id: "u2",
      allBranches: false,
      branchAccess: ["b1"],
      warehouseAccess: [
        { branchId: "b1", allWarehouses: true, warehouseIds: [] },
      ],
    } as unknown as User;

    const user = userEvent.setup();
    renderWithAuth(<StockTransfersScreen />, { user: confined });
    await waitFor(() => expect(warehouseService.list).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(
      screen.getByLabelText("Filter gudang — asal maupun tujuan"),
    );

    expect(
      screen.getByRole("option", { name: "Gudang Bazar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Gudang Pusat" }),
    ).toBeInTheDocument();
  });

  it("hides a warehouse in a branch the user does not hold", async () => {
    const elsewhere = {
      _id: "u3",
      allBranches: false,
      branchAccess: ["b9"],
      warehouseAccess: [
        { branchId: "b9", allWarehouses: true, warehouseIds: [] },
      ],
    } as unknown as User;

    const user = userEvent.setup();
    renderWithAuth(<StockTransfersScreen />, { user: elsewhere });
    await waitFor(() => expect(warehouseService.list).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(
      screen.getByLabelText("Filter gudang — asal maupun tujuan"),
    );

    expect(
      screen.queryByRole("option", { name: "Gudang Bazar" }),
    ).not.toBeInTheDocument();
    // Still the shared one: it serves every branch, including b9.
    expect(
      screen.getByRole("option", { name: "Gudang Pusat" }),
    ).toBeInTheDocument();
  });
});
