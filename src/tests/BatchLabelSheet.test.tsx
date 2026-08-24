import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BatchLabelSheet } from "@/features/inventory";
import { productBatchService } from "@/services/productBatch.service";
import type { ProductBatch } from "@/types/inventory";

import { FULL_REACH_USER, renderWithAuth } from "./helpers/renderWithAuth";

/**
 * The label sheet, against a mocked service.
 *
 * WHAT THESE TESTS GUARD. Batch codes became unique across the tenant so that
 * they could be SCANNED — a till reads a label, resolves it to exactly one lot,
 * and deducts from that lot rather than guessing by FEFO. This screen is the
 * other half of that decision, so the things worth protecting are:
 *
 *  1. every label carries the code in figures a human can retype, because a
 *     scuffed label is the case the whole design has to survive;
 *  2. the supplier's own batch number is on it too — a recall notice names the
 *     factory batch, and a label that omits it cannot be matched to the notice;
 *  3. one sheet covers several lots, which is what a transfer needs: every lot
 *     it moves is relabelled at the destination;
 *  4. the copy count repeats each lot, because the number somebody wants is
 *     "one per carton".
 *
 * THE SYMBOLS THEMSELVES ARE NOT ASSERTED. jsdom implements no canvas 2D
 * context, so JsBarcode and QRCode both no-op — which is exactly why the
 * component catches their failures rather than letting a blank canvas take the
 * label down with it.
 */
function lot(overrides: Partial<ProductBatch> = {}): ProductBatch {
  return {
    _id: "b1",
    tenantId: "t1",
    warehouseId: "wh1",
    productId: "p1",
    receiptId: null,
    batchCode: "VAKSIN-270301",
    supplierBatchCode: "VAK-A26",
    expiryDate: "2027-03-01T00:00:00.000Z",
    initialQty: "20.0000",
    qtyRemaining: "8.0000",
    costPerUnit: "50000.0000",
    isConsignment: false,
    createdBy: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    productName: "Vaksin Rabies",
    productSku: "VAKSIN",
    productUnit: "vial",
    warehouseName: "Gudang Pusat",
    ...overrides,
  };
}

function render(ids: string[]) {
  return renderWithAuth(<BatchLabelSheet ids={ids} />, {
    user: FULL_REACH_USER,
  });
}

const ID_A = "a".repeat(24);
const ID_B = "b".repeat(24);

describe("BatchLabelSheet", () => {
  it("prints the code in figures, not only as a symbol", async () => {
    jest.spyOn(productBatchService, "getById").mockResolvedValue(lot());

    render([ID_A]);

    // The line a person retypes when the scanner will not read the sticker.
    expect(await screen.findByText("VAKSIN-270301")).toBeInTheDocument();
    expect(screen.getByText("Vaksin Rabies")).toBeInTheDocument();
    expect(screen.getByText(/exp 2027-03-01/)).toBeInTheDocument();
  });

  /**
   * A recall notice names the SUPPLIER'S batch. A label carrying only our code
   * leaves somebody holding a carton they cannot match to the notice.
   */
  it("carries the supplier's batch number too", async () => {
    jest.spyOn(productBatchService, "getById").mockResolvedValue(lot());

    render([ID_A]);

    expect(await screen.findByText(/supplier: VAK-A26/)).toBeInTheDocument();
  });

  it("says nothing about a supplier when the carton carried no number", async () => {
    jest
      .spyOn(productBatchService, "getById")
      .mockResolvedValue(lot({ supplierBatchCode: null }));

    render([ID_A]);

    await screen.findByText("VAKSIN-270301");
    expect(screen.queryByText(/supplier:/)).not.toBeInTheDocument();
  });

  /**
   * ONE SHEET, SEVERAL LOTS — the shape a transfer needs. Every lot it moves is
   * re-created at the destination under a new code, so a five-line transfer is
   * five labels to reprint in one trip to the printer.
   */
  it("prints every lot it was given", async () => {
    jest
      .spyOn(productBatchService, "getById")
      .mockImplementation(async (id: string) =>
        lot(
          id === ID_A
            ? { _id: ID_A, batchCode: "VAKSIN-270301" }
            : { _id: ID_B, batchCode: "VAKSIN-270301-2" },
        ),
      );

    render([ID_A, ID_B]);

    expect(await screen.findByText("VAKSIN-270301")).toBeInTheDocument();
    expect(screen.getByText("VAKSIN-270301-2")).toBeInTheDocument();
  });

  /** One per carton — so the count repeats the lot rather than the sheet. */
  it("repeats each lot as many times as asked", async () => {
    const user = userEvent.setup();
    jest.spyOn(productBatchService, "getById").mockResolvedValue(lot());

    render([ID_A]);
    await screen.findByText("VAKSIN-270301");

    const copies = screen.getByLabelText(/Jumlah per batch/);
    await user.clear(copies);
    await user.type(copies, "3");

    await waitFor(() =>
      expect(screen.getAllByText("VAKSIN-270301")).toHaveLength(3),
    );
  });

  /**
   * A lot deleted since the link was built costs its own label, not the sheet.
   * The other cartons still need stickers.
   */
  it("keeps the labels it could load when one lot fails", async () => {
    jest
      .spyOn(productBatchService, "getById")
      .mockImplementation(async (id: string) => {
        if (id === ID_B) throw new Error("gone");
        return lot({ _id: ID_A });
      });

    render([ID_A, ID_B]);

    expect(await screen.findByText("VAKSIN-270301")).toBeInTheDocument();
    expect(
      screen.getByText(/1 batch tidak bisa dibuka/),
    ).toBeInTheDocument();
  });

  it("asks for nothing when no lot was named, and says where to pick one", async () => {
    const getById = jest.spyOn(productBatchService, "getById");

    render([]);

    expect(
      await screen.findByText(/Belum ada batch yang dipilih/),
    ).toBeInTheDocument();
    expect(getById).not.toHaveBeenCalled();
  });
});
