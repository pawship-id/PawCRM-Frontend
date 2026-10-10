import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { StockTransferDetail } from "@/features/inventory";
import { ApiError } from "@/services/api-error";
import { stockTransferService } from "@/services/stockTransfer.service";
import type { StockMovement, StockTransferDetail as Detail } from "@/types/inventory";

jest.mock("@/services/stockTransfer.service");
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Swal = require("sweetalert2").default as { fire: jest.Mock };

const asMock = <T,>(fn: T) => fn as unknown as jest.Mock;

/**
 * One transfer, read — and the place it is received, corrected, cancelled and
 * printed.
 *
 * WHAT IS WORTH PINNING. What this screen decides that nothing else does, and
 * each is wrong in a way a reader would believe:
 *
 *   THE ACTIONS FOLLOW THE STATUS. Only a transfer that is still on the road can
 *   be corrected, received or cancelled; offering Ubah on a received one invites
 *   an edit the server must refuse, and hiding all four on a cancelled one
 *   without saying why reads as a lost permission.
 *
 *   THE MAGNITUDE, NOT THE SIGN. The outbound rows are negative because the
 *   goods left, and a column of minuses under "what was moved" reads as a
 *   shortage.
 *
 */
const TRANSFER_ID = "tr1";

function row(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    _id: "mv1",
    tenantId: "t1",
    warehouseId: "w1",
    branchId: null,
    productId: "p1",
    movementType: "transfer_out",
    qty: "-4.0000",
    hppAtTime: "50000.0000",
    batchId: null,
    destinationWarehouseId: "w2",
    bundleSourceId: null,
    reference: { type: "transfer_manual", id: TRANSFER_ID },
    idempotencyKey: null,
    notes: "Persiapan bazar",
    lineNotes: null,
    createdAt: "2026-08-19T02:00:00.000Z",
    createdBy: "u1",
    sv: 1,
    balanceAfter: null,
    batchCode: "RC-B26",
    batchExpiryDate: null,
    createdByName: "Rina",
    warehouseName: "Gudang Pusat",
    destinationWarehouseName: "Gudang Bazar",
    productName: "Royal Canin Adult 3kg",
    productSku: "RC-3KG",
    productUnit: "sak",
    referenceNo: null,
    ...overrides,
  } as StockMovement;
}

function transfer(overrides: Partial<Detail> = {}): Detail {
  return {
    _id: TRANSFER_ID,
    transferNumber: "TRF/2610/0042",
    status: "in_transit",
    legacy: false,
    revision: 0,
    transferDate: "2026-08-19T02:00:00.000Z",
    fromWarehouseId: "w1",
    toWarehouseId: "w2",
    fromWarehouseName: "Gudang Pusat",
    toWarehouseName: "Gudang Bazar",
    productCount: 1,
    lotCount: 1,
    value: "200000.0000",
    notes: "Persiapan bazar",
    createdBy: "u1",
    createdByName: "Rina",
    createdAt: "2026-08-19T02:00:00.000Z",
    receivedAt: null,
    receivedByName: null,
    cancelledAt: null,
    cancelledByName: null,
    items: [
      {
        productId: "p1",
        qty: "4.0000",
        batchId: null,
        autoFefo: false,
        notes: null,
        productName: "Royal Canin Adult 3kg",
        productSku: "RC-3KG",
        productUnit: "sak",
      },
    ],
    lines: [row()],
    arrivals: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  asMock(stockTransferService.getById).mockResolvedValue(transfer());
});

it("asks for the document by its id", async () => {
  renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

  await waitFor(() =>
    expect(stockTransferService.getById).toHaveBeenCalledWith(TRANSFER_ID),
  );
});

/**
 * WHO AND WHEN AS ONE FACT. The header's date says which day; only this line
 * says which moment, which is what tells two transfers made on one busy day
 * apart.
 */
it("dates the author line down to the minute", async () => {
  renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

  const author = (await screen.findByText("Rina")).closest("dd");
  expect(author).not.toBeNull();
  expect(within(author!).getByText(/\d{1,2}[.:]\d{2}/)).toBeInTheDocument();
});

it("shows the number, both ends and the note", async () => {
  renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

  expect(await screen.findByText("TRF/2610/0042")).toBeInTheDocument();
  // Named in the alert as well as in the header card, hence "at least one".
  expect(screen.getAllByText("Gudang Pusat").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Gudang Bazar").length).toBeGreaterThan(0);
  expect(screen.getByText("Persiapan bazar")).toBeInTheDocument();
});

it("shows the quantity as a magnitude, not as a shortage", async () => {
  renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

  const line = (await screen.findByText("Royal Canin Adult 3kg")).closest("tr");
  expect(within(line!).getByText("4")).toBeInTheDocument();
  expect(within(line!).queryByText("-4")).not.toBeInTheDocument();
});

/** Value per line, at the average the ledger used when the goods moved. */
it("values each line at its own HPP and totals them", async () => {
  asMock(stockTransferService.getById).mockResolvedValue(
    transfer({
      productCount: 2,
      lines: [
        row(),
        row({
          _id: "mv3",
          productId: "p2",
          productName: "Whiskas Tuna",
          productSku: "WSK",
          qty: "-2.0000",
          hppAtTime: "60000.0000",
        }),
      ],
    }),
  );

  renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

  // 4 × 50.000 = 200.000 and 2 × 60.000 = 120.000 → 320.000
  expect(await screen.findByText(/200\.000/)).toBeInTheDocument();
  expect(screen.getByText(/120\.000/)).toBeInTheDocument();
  expect(screen.getByText(/320\.000/)).toBeInTheDocument();
});

describe("a transfer that is still on the road", () => {
  it("says Belum diterima and what that means for the two stocks", async () => {
    renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

    expect(await screen.findByText("Belum diterima")).toBeInTheDocument();
    // The one consequence people do not expect: the source has already gone
    // down and the destination has not moved.
    expect(
      screen.getByText(/belum tercatat di/, { exact: false }),
    ).toBeInTheDocument();
  });

  it("offers Ubah, Batalkan and Terima, and the surat jalan", async () => {
    renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

    const edit = await screen.findByRole("link", { name: /Ubah/ });
    expect(edit).toHaveAttribute(
      "href",
      `/dashboard/inventory/transfers/${TRANSFER_ID}/edit`,
    );
    expect(
      screen.getByRole("button", { name: "Batalkan transfer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Terima barang" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Cetak surat jalan/ }),
    ).toHaveAttribute(
      "href",
      `/dashboard/inventory/transfers/${TRANSFER_ID}/print`,
    );
  });

  it("asks before receiving, then shows the received document", async () => {
    asMock(stockTransferService.receive).mockResolvedValue(
      transfer({
        status: "received",
        receivedAt: "2026-08-20T03:00:00.000Z",
        receivedByName: "Dewi",
      }),
    );

    const user = userEvent.setup();
    renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

    await user.click(await screen.findByRole("button", { name: "Terima barang" }));

    // Nothing is posted by opening the dialog.
    expect(stockTransferService.receive).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/tidak bisa diubah lagi/)).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: "Terima barang" }),
    );

    await waitFor(() =>
      expect(stockTransferService.receive).toHaveBeenCalledWith(TRANSFER_ID),
    );
    // The page now says what happened, and the actions have gone.
    expect(await screen.findByText("Diterima")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ubah/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Terima barang" }),
    ).not.toBeInTheDocument();
  });

  it("cancels only after a confirmation that names what happens to the goods", async () => {
    asMock(stockTransferService.cancel).mockResolvedValue(
      transfer({ status: "cancelled", cancelledAt: "2026-08-20T03:00:00.000Z" }),
    );

    const user = userEvent.setup();
    renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

    await user.click(
      await screen.findByRole("button", { name: "Batalkan transfer" }),
    );

    expect(stockTransferService.cancel).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/dikembalikan ke Gudang Pusat/)).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: "Batalkan transfer" }),
    );

    await waitFor(() =>
      expect(stockTransferService.cancel).toHaveBeenCalledWith(TRANSFER_ID),
    );
    expect(await screen.findByText("Dibatalkan")).toBeInTheDocument();
  });

  /**
   * A FAILED ACT IS A TOAST (ui-rules §9): the screen behind it is intact and
   * still the thing to read. The usual cause is that somebody else got there
   * first, and the sentence says so.
   */
  it("reports a refusal as an error toast and leaves the page as it was", async () => {
    asMock(stockTransferService.receive).mockRejectedValue(
      new ApiError(
        "Transfer TRF/2610/0042 sudah diterima, jadi tidak bisa diterima",
        409,
      ),
    );

    const user = userEvent.setup();
    renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

    await user.click(await screen.findByRole("button", { name: "Terima barang" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Terima barang",
      }),
    );

    await waitFor(() =>
      expect(Swal.fire).toHaveBeenCalledWith(
        expect.objectContaining({ icon: "error", timer: 6000 }),
      ),
    );
    expect(screen.getByText("Belum diterima")).toBeInTheDocument();
  });

  it("hides the writes from a role that may only read, but keeps the print", async () => {
    renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "stockMovements", actions: ["read"] }],
    });

    expect(
      await screen.findByRole("link", { name: /Cetak surat jalan/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ubah/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Terima barang" }),
    ).not.toBeInTheDocument();
  });
});

describe("a transfer that has been received", () => {
  const received = () =>
    transfer({
      status: "received",
      receivedAt: "2026-08-20T03:00:00.000Z",
      receivedByName: "Dewi",
      arrivals: [
        row({
          _id: "mv9",
          movementType: "transfer_in",
          qty: "4.0000",
          warehouseId: "w2",
          batchId: "b-new",
        }),
      ],
    });

  beforeEach(() => {
    asMock(stockTransferService.getById).mockResolvedValue(received());
  });

  it("can no longer be corrected, received or cancelled", async () => {
    renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

    expect(await screen.findByText("Diterima")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ubah/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Batalkan transfer" }),
    ).not.toBeInTheDocument();
    // …but its note is still wanted, as often as before the goods left.
    expect(
      screen.getByRole("link", { name: /Cetak surat jalan/ }),
    ).toBeInTheDocument();
  });

  it("says who received it and when", async () => {
    renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

    expect(await screen.findByText("Dewi")).toBeInTheDocument();
  });

  /**
   * The destination lot is minted its own code, so the carton is relabelled when
   * it lands — and the labels are one click away.
   */
  it("links the labels of the lots that arrived", async () => {
    renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

    const link = await screen.findByRole("link", {
      name: /Cetak label gudang tujuan/,
    });
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/inventory/batches/labels?ids=b-new",
    );
  });
});

it("says a cancelled transfer was cancelled, and by whom", async () => {
  asMock(stockTransferService.getById).mockResolvedValue(
    transfer({
      status: "cancelled",
      cancelledAt: "2026-08-20T03:00:00.000Z",
      cancelledByName: "Budi",
    }),
  );

  renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

  expect(await screen.findByText(/dibatalkan pada/)).toBeInTheDocument();
  expect(screen.getByText(/oleh Budi/)).toBeInTheDocument();
});

it("says so when the id names nothing", async () => {
  asMock(stockTransferService.getById).mockRejectedValue(
    new ApiError("Transfer tidak ditemukan", 404),
  );

  renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

  expect(await screen.findByText(/tidak ditemukan/)).toBeInTheDocument();
});
