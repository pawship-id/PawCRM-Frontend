import { lotsWithOneMore } from "@/features/pos/hooks/lineLots";
import type { PosLot } from "@/types/api";

const lot = (_id: string, qtyRemaining: string): PosLot => ({
  _id,
  batchCode: _id.toUpperCase(),
  supplierBatchCode: null,
  expiryDate: "2027-01-31",
  qtyRemaining,
});

/** Soonest expiry first, as GET /pos/catalog/:id/lots returns them. */
const SHELF = [lot("b1", "2"), lot("b2", "10")];

describe("lotsWithOneMore — one more unit on a product line", () => {
  it("adds a scanned lot to the lots the line already names", () => {
    expect(
      lotsWithOneMore({
        named: [{ batchId: "b1", qty: "1" }],
        lineQty: 1,
        scannedBatchId: "b1",
        lots: [],
      }),
    ).toEqual([{ batchId: "b1", qty: "2" }]);
  });

  it("keeps one line with two lots when a different lot is scanned", () => {
    expect(
      lotsWithOneMore({
        named: [{ batchId: "b1", qty: "1" }],
        lineQty: 1,
        scannedBatchId: "b2",
        lots: [],
      }),
    ).toEqual([
      { batchId: "b1", qty: "1" },
      { batchId: "b2", qty: "1" },
    ]);
  });

  it("names a FEFO line's units the way FEFO would, beside the scanned lot", () => {
    expect(
      lotsWithOneMore({
        named: [],
        lineQty: 3,
        scannedBatchId: "b2",
        lots: SHELF,
      }),
    ).toEqual([
      { batchId: "b2", qty: "2" },
      { batchId: "b1", qty: "2" },
    ]);
  });

  it("places a tapped unit by FEFO on what each lot still holds", () => {
    expect(
      lotsWithOneMore({
        named: [{ batchId: "b1", qty: "2" }],
        lineQty: 2,
        scannedBatchId: null,
        lots: SHELF,
      }),
    ).toEqual([
      { batchId: "b1", qty: "2" },
      { batchId: "b2", qty: "1" },
    ]);
  });

  it("gives up when the shelf in the books cannot cover the line", () => {
    expect(
      lotsWithOneMore({
        named: [],
        lineQty: 12,
        scannedBatchId: "b1",
        lots: SHELF,
      }),
    ).toBeNull();
  });
});
