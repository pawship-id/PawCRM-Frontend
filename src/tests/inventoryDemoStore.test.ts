import * as demo from "@/features/inventory/data/demoStore";
import { toMinor } from "@/utils/decimal";

/**
 * The prototype store stands in for the Inventory API, so what is asserted here
 * is that it makes the same DECISIONS the backend does. A prototype that
 * demonstrated behaviour the real service does not have would be worse than no
 * prototype at all — it would teach the wrong flow to whoever reviews it.
 *
 * The four rules that matter, all of them counter-intuitive enough that a
 * reviewer would not catch a regression by eye:
 *   - direction comes from the SIGN, so a positive adjustment is an acquisition;
 *   - FEFO writes ONE ROW PER LOT, not one row per request;
 *   - a short pick is recorded, not refused;
 *   - a transfer carries each lot across and changes no cost.
 */
beforeEach(() => {
  demo.resetState();
});

const RC = "prd_rc3kg";
const WSK = "prd_wsk";
const SHAMPOO = "prd_shampoo";
const PASIR = "prd_pasir";
const UTAMA = "wh_utama";
const BARAT = "wh_barat";

describe("FEFO allocation", () => {
  it("draws the closest-to-expiring lot first", () => {
    // RC has two lots: one expiring in 24 days (3 left), one in 180 (17 left).
    const allocations = demo.previewFefo(RC, UTAMA, "2");

    expect(allocations).toHaveLength(1);
    expect(allocations[0].batch?.batchCode).toBe("RCA3KG-260924");
  });

  it("splits across lots when one cannot cover the request", () => {
    const allocations = demo.previewFefo(RC, UTAMA, "6");

    // One request in, TWO rows out — which is what makes the picking auditable.
    expect(allocations).toHaveLength(2);
    expect(allocations[0].batch?.batchCode).toBe("RCA3KG-260924");
    expect(allocations[0].qty).toBe("3.0000");
    expect(allocations[1].batch?.batchCode).toBe("RCA3KG-261120");
    expect(allocations[1].qty).toBe("3.0000");
  });

  it("records a short pick against the last lot rather than refusing it", () => {
    // 25 wanted, 20 available across both lots.
    const allocations = demo.previewFefo(RC, UTAMA, "25");

    expect(allocations).toHaveLength(2);
    const last = allocations[allocations.length - 1];
    expect(last.short).toBe(true);
    // The shortfall rides on the last lot, driving it negative.
    expect(last.qty).toBe("22.0000");
  });

  it("returns one unbatched allocation for a product with no lots", () => {
    const allocations = demo.previewFefo(SHAMPOO, UTAMA, "4");

    expect(allocations).toHaveLength(1);
    expect(allocations[0].batch).toBeNull();
  });
});

describe("adjustment — direction comes from the sign", () => {
  it("treats a POSITIVE adjustment as an acquisition, creating a lot", () => {
    // This is the opening-stock path. Keying the work off the movement type
    // alone would send it down the outbound branch: no lot, no cost basis.
    const before = demo.batchesAt(WSK, BARAT).length;

    demo.postAdjustment({
      operation: "adjustment",
      productId: WSK,
      warehouseId: BARAT,
      qty: "24",
      supplierBatchCode: "WSK-OPENING",
      expiryDate: "2027-01-31",
      costPerUnit: "30000",
    });

    expect(demo.batchesAt(WSK, BARAT)).toHaveLength(before + 1);
    expect(demo.qtyOnHand(WSK, BARAT)).toBe("24.0000");
  });

  it("establishes a cost basis for a product that had none", () => {
    demo.postAdjustment({
      operation: "adjustment",
      productId: PASIR,
      warehouseId: UTAMA,
      qty: "10",
      costPerUnit: "58000",
    });

    const pasir = demo.getState().products.find((p) => p._id === PASIR)!;
    expect(pasir.hppAvg).toBe("58000.0000");
  });

  it("leaves the average alone when no cost is supplied", () => {
    // "Found two extra on the shelf" carries no new information about cost.
    const before = demo.getState().products.find((p) => p._id === WSK)!.hppAvg;

    demo.postAdjustment({
      operation: "adjustment",
      productId: WSK,
      warehouseId: UTAMA,
      qty: "2",
      supplierBatchCode: "WSK-FOUND",
      expiryDate: "2027-01-31",
    });

    expect(demo.getState().products.find((p) => p._id === WSK)!.hppAvg).toBe(
      before,
    );
  });

  it("fans a NEGATIVE adjustment out across the lots FEFO drew from", () => {
    const written = demo.postAdjustment({
      operation: "adjustment",
      productId: RC,
      warehouseId: UTAMA,
      qty: "-6",
    });

    expect(written).toHaveLength(2);
    expect(written.every((m) => m.movementType === "adjustment")).toBe(true);
    expect(written.map((m) => m.qty)).toEqual(["-3.0000", "-3.0000"]);
  });

  it("carries no upstream document on a manual adjustment", () => {
    const [movement] = demo.postAdjustment({
      operation: "adjustment",
      productId: SHAMPOO,
      warehouseId: UTAMA,
      qty: "-1",
    });

    expect(movement.reference).toEqual({ type: "manual_adjustment", id: null });
  });
});

describe("transfer", () => {
  it("writes a mirrored PAIR for every lot it draws from", () => {
    const written = demo.postTransfer({
      operation: "transfer",
      fromWarehouseId: UTAMA,
      toWarehouseId: BARAT,
      items: [{ productId: RC, qty: "6" }],
    });

    // 6 units across two lots → 2 out + 2 in.
    expect(written).toHaveLength(4);
    expect(written.filter((m) => m.movementType === "transfer_out")).toHaveLength(2);
    expect(written.filter((m) => m.movementType === "transfer_in")).toHaveLength(2);
  });

  it("ties both halves together with one correlation id", () => {
    const written = demo.postTransfer({
      operation: "transfer",
      fromWarehouseId: UTAMA,
      toWarehouseId: BARAT,
      items: [{ productId: RC, qty: "2" }],
    });

    const ids = new Set(written.map((m) => m.reference.id));
    expect(ids.size).toBe(1);
    expect(written[0].reference.type).toBe("transfer_manual");
  });

  it("carries each source lot's code, expiry and cost to the destination", () => {
    // Without this, transferring goods that expire would strip their expiry and
    // the receiving warehouse would hold stock FEFO could never order.
    const source = demo.liveBatches(RC, UTAMA)[0];

    demo.postTransfer({
      operation: "transfer",
      fromWarehouseId: UTAMA,
      toWarehouseId: BARAT,
      items: [{ productId: RC, qty: "2" }],
    });

    const arrived = demo.batchesAt(RC, BARAT);
    expect(arrived).toHaveLength(1);
    expect(arrived[0].batchCode).toBe(source.batchCode);
    expect(arrived[0].expiryDate).toBe(source.expiryDate);
    expect(arrived[0].costPerUnit).toBe(source.costPerUnit);
    // The goods did not arrive on that receipt — they came from another
    // warehouse — so pointing at it would misreport where the receipt delivered.
    expect(arrived[0].receiptId).toBeNull();
  });

  it("moves the balance out of one warehouse and into the other", () => {
    const before = toMinor(demo.qtyOnHand(RC, UTAMA))!;

    demo.postTransfer({
      operation: "transfer",
      fromWarehouseId: UTAMA,
      toWarehouseId: BARAT,
      items: [{ productId: RC, qty: "5" }],
    });

    expect(toMinor(demo.qtyOnHand(RC, UTAMA))).toBe(before - toMinor("5")!);
    expect(demo.qtyOnHand(RC, BARAT)).toBe("5.0000");
  });

  it("does NOT reprice stock that merely changed shelf", () => {
    const before = demo.getState().products.find((p) => p._id === RC)!.hppAvg;

    demo.postTransfer({
      operation: "transfer",
      fromWarehouseId: UTAMA,
      toWarehouseId: BARAT,
      items: [{ productId: RC, qty: "3" }],
    });

    expect(demo.getState().products.find((p) => p._id === RC)!.hppAvg).toBe(before);
  });

  it("refuses a transfer to the same warehouse", () => {
    expect(() =>
      demo.postTransfer({
        operation: "transfer",
        fromWarehouseId: UTAMA,
        toWarehouseId: UTAMA,
        items: [{ productId: RC, qty: "1" }],
      }),
    ).toThrow(/berbeda|different/i);
  });

  it("refuses a non-positive quantity — direction comes from the two ids", () => {
    expect(() =>
      demo.postTransfer({
        operation: "transfer",
        fromWarehouseId: UTAMA,
        toWarehouseId: BARAT,
        items: [{ productId: RC, qty: "-3" }],
      }),
    ).toThrow(/positive/i);
  });
});

describe("journal preview", () => {
  it("books a sale against COGS", () => {
    const lines = demo.previewJournal("pos_sale", "-3", "100000");

    expect(lines[0].accountCode).toBe("5101");
    expect(lines[1].accountCode).toBe("1201");
    expect(lines[0].debit).toBe("300000.0000");
  });

  it("books an adjustment against inventory loss, keeping COGS readable", () => {
    const lines = demo.previewJournal("adjustment", "-2", "100000");

    expect(lines[0].accountCode).toBe("5201");
  });

  it("debits inventory when goods come in", () => {
    const lines = demo.previewJournal("adjustment", "5", "100000");

    expect(lines[0].accountCode).toBe("1201");
    expect(lines[0].debit).toBe("500000.0000");
  });

  it("posts nothing for a transfer", () => {
    expect(demo.previewJournal("transfer_out", "-5", "100000")).toEqual([]);
    expect(demo.previewJournal("transfer_in", "5", "100000")).toEqual([]);
  });

  it("posts nothing for goods that have never had a cost", () => {
    // It moved a quantity, not a value — a zero-amount entry is only noise.
    expect(demo.previewJournal("adjustment", "5", null)).toEqual([]);
  });
});

describe("the ledger is append-only", () => {
  it("adds rows rather than editing them, so the balance stays re-derivable", () => {
    const before = demo.movementsFor(SHAMPOO, UTAMA).length;

    demo.postAdjustment({
      operation: "adjustment",
      productId: SHAMPOO,
      warehouseId: UTAMA,
      qty: "-1",
    });

    const after = demo.movementsFor(SHAMPOO, UTAMA);
    expect(after).toHaveLength(before + 1);

    // The balance equals the sum of every row — the property that makes the
    // cached quantities safe to trust.
    const summed = after.reduce((acc, m) => acc + (toMinor(m.qty) ?? 0n), 0n);
    expect(toMinor(demo.qtyOnHand(SHAMPOO, UTAMA))).toBe(summed);
  });
});

