import { lotsAtQty, lotsWithOneMore } from "@/features/pos/hooks/lineLots";
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

  it("puts what the books cannot cover on the last lot, keeping the scanned one", () => {
    expect(
      lotsWithOneMore({
        named: [],
        lineQty: 12,
        scannedBatchId: "b1",
        lots: SHELF,
      }),
    ).toEqual([
      { batchId: "b1", qty: "2" },
      { batchId: "b2", qty: "11" },
    ]);
  });

  it("puts a tap on the line's last lot when there is no shelf to read", () => {
    expect(
      lotsWithOneMore({
        named: [{ batchId: "b1", qty: "1" }],
        lineQty: 1,
        scannedBatchId: null,
        lots: [],
      }),
    ).toEqual([{ batchId: "b1", qty: "2" }]);
  });

  it("names nothing when there is no lot at all", () => {
    expect(
      lotsWithOneMore({ named: [], lineQty: 1, scannedBatchId: null, lots: [] }),
    ).toBeNull();
  });
});

describe("lotsAtQty — stepping a line's quantity in the basket", () => {
  const named = [
    { batchId: "b2", qty: "1" },
    { batchId: "b1", qty: "2" },
  ];

  it("takes a minus off the last lot on the line", () => {
    expect(lotsAtQty({ named, qty: 2, lots: [] })).toEqual([
      { batchId: "b2", qty: "1" },
      { batchId: "b1", qty: "1" },
    ]);
  });

  it("drops a lot whose share reaches zero", () => {
    expect(lotsAtQty({ named, qty: 1, lots: [] })).toEqual([
      { batchId: "b2", qty: "1" },
    ]);
  });

  it("places a plus by FEFO on what each lot still holds", () => {
    expect(lotsAtQty({ named, qty: 4, lots: SHELF })).toEqual([
      { batchId: "b2", qty: "2" },
      { batchId: "b1", qty: "2" },
    ]);
  });

  it("keeps the lots when the books cannot cover a plus", () => {
    expect(lotsAtQty({ named, qty: 14, lots: SHELF })).toEqual([
      { batchId: "b2", qty: "12" },
      { batchId: "b1", qty: "2" },
    ]);
  });
});
