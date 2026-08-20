import { screen, waitFor, within } from "@testing-library/react";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { StockTransferDetail } from "@/features/inventory";
import { stockMovementService } from "@/services/stockMovement.service";
import type { StockMovement } from "@/types/inventory";

jest.mock("@/services/stockMovement.service");

const asMock = <T,>(fn: T) => fn as unknown as jest.Mock;

/**
 * One transfer, read by its correlation id.
 *
 * WHAT IS WORTH PINNING. Three things this screen decides that nothing else
 * does, and each is wrong in a way a reader would believe:
 *
 *   ONE SIDE OF THE PAIR. Every product moved wrote a `transfer_out` and a
 *   mirroring `transfer_in`; rendering both lists every product twice and reads
 *   as double the goods.
 *
 *   THE MAGNITUDE, NOT THE SIGN. The outbound rows are negative because the
 *   goods left, and a column of minuses under "what was moved" reads as a
 *   shortage.
 *
 *   THE VALUE IS NOT A JOURNAL FIGURE. A transfer posts no entry at all, so a
 *   total on screen that appears in no report is a gap somebody goes looking
 *   for unless the screen says why.
 */
const TRANSFER_ID = "tr1";

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
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

/** What the ledger answers with: every row of the posting, both directions. */
function bothDirections() {
  return {
    items: [
      movement(),
      movement({
        _id: "mv2",
        movementType: "transfer_in",
        qty: "4.0000",
        warehouseId: "w2",
        warehouseName: "Gudang Bazar",
      }),
    ],
    pagination: { page: 1, limit: 200, total: 2, totalPages: 1 },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  asMock(stockMovementService.list).mockResolvedValue(bothDirections());
});

it("asks for the rows of this transfer, by its correlation id", async () => {
  renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

  await waitFor(() =>
    expect(stockMovementService.list).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceType: "transfer_manual",
        referenceId: TRANSFER_ID,
      }),
    ),
  );
});

it("lists one side of the pair, not both", async () => {
  renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

  // One product row, though the posting wrote two movements.
  expect(await screen.findAllByText("Royal Canin Adult 3kg")).toHaveLength(1);
  // And it says so: the counts differ on purpose.
  expect(screen.getByText("1 baris")).toBeInTheDocument();
  expect(screen.getByText("2 pergerakan")).toBeInTheDocument();
});

it("shows the quantity as a magnitude, not as a shortage", async () => {
  renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

  const row = (await screen.findByText("Royal Canin Adult 3kg")).closest("tr");
  expect(within(row!).getByText("4")).toBeInTheDocument();
  expect(within(row!).queryByText("-4")).not.toBeInTheDocument();
});

/** Value per line, at the average the ledger used when the goods moved. */
it("values each line at its own HPP and totals them", async () => {
  asMock(stockMovementService.list).mockResolvedValue({
    items: [
      movement(),
      movement({ _id: "mv2", movementType: "transfer_in", qty: "4.0000" }),
      movement({
        _id: "mv3",
        productId: "p2",
        productName: "Whiskas Tuna",
        productSku: "WSK",
        qty: "-2.0000",
        hppAtTime: "60000.0000",
      }),
    ],
    pagination: { page: 1, limit: 200, total: 3, totalPages: 1 },
  });

  renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

  // 4 × 50.000 = 200.000 and 2 × 60.000 = 120.000 → 320.000
  expect(await screen.findByText(/200\.000/)).toBeInTheDocument();
  expect(screen.getByText(/120\.000/)).toBeInTheDocument();
  expect(screen.getByText(/320\.000/)).toBeInTheDocument();
});

/**
 * A transfer moves goods between two warehouses of one tenant, so total
 * inventory value does not change and no entry is posted. A value on screen that
 * appears in no report is a gap somebody goes looking for unless it says why.
 */
it("says the value is not a journal figure", async () => {
  renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

  expect(await screen.findByText(/tidak membuat jurnal/)).toBeInTheDocument();
});

it("assembles the header from the rows, which share it", async () => {
  renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

  expect(await screen.findByText("Gudang Pusat")).toBeInTheDocument();
  expect(screen.getByText("Gudang Bazar")).toBeInTheDocument();
  expect(screen.getByText("Rina")).toBeInTheDocument();
  expect(screen.getByText("Persiapan bazar")).toBeInTheDocument();
});

/** An id that names no rows is a transfer that does not exist. */
it("says so when the id names nothing", async () => {
  asMock(stockMovementService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 200, total: 0, totalPages: 0 },
  });

  renderWithAuth(<StockTransferDetail transferId={TRANSFER_ID} />);

  expect(await screen.findByText(/tidak ditemukan/)).toBeInTheDocument();
});
