import {
  partitionBatches,
  qtyAtWarehouse,
} from "@/features/inventory/utils/ledger";
import type { ProductBatch } from "@/types/inventory";

/**
 * The two derivations the stock card still makes for itself.
 *
 * THIS FILE USED TO BE MOSTLY ABOUT THE RUNNING BALANCE — reconstructing it by
 * anchoring to the current on-hand quantity and walking backwards, and deciding
 * which filters made that anchor invalid. The API returns `balanceAfter` per row
 * now (PawCRM-Backend 0.20.0), summed over the rows a filter hides as well, so
 * the reconstruction and its guard are gone rather than retested. What is left
 * is an ordering choice and a lookup with a default.
 */
function batch(overrides: Partial<ProductBatch> = {}): ProductBatch {
  return {
    _id: "b1",
    tenantId: "t1",
    warehouseId: "wh1",
    productId: "p1",
    receiptId: null,
    batchCode: "B-1",
    expiryDate: null,
    initialQty: "10.0000",
    qtyRemaining: "10.0000",
    costPerUnit: "1000.0000",
    isConsignment: false,
    createdBy: null,
    createdAt: "",
    updatedAt: "",
    productName: "Royal Canin Adult 3kg",
    productSku: "RC-3KG",
    productUnit: "sak",
    warehouseName: "Gudang Pusat",
    ...overrides,
  };
}

describe("partitionBatches", () => {
  it("floats live lots above exhausted ones without re-sorting them", () => {
    const { live, spent } = partitionBatches([
      batch({ _id: "a", qtyRemaining: "0.0000" }),
      batch({ _id: "b", qtyRemaining: "3.0000" }),
      batch({ _id: "c", qtyRemaining: "1.0000" }),
    ]);

    // b before c: the API's expiry order is preserved, not replaced by quantity.
    expect(live.map((lot) => lot._id)).toEqual(["b", "c"]);
    expect(spent.map((lot) => lot._id)).toEqual(["a"]);
  });

  it("does not queue a lot that has gone negative", () => {
    // A withdrawal outran this lot; there is nothing left to pick from it, so it
    // must not appear in the FEFO order. The table still labels it "minus"
    // rather than "habis" so it stays visible as the row to fix.
    const { live, spent } = partitionBatches([
      batch({ qtyRemaining: "-2.0000" }),
    ]);

    expect(live).toHaveLength(0);
    expect(spent).toHaveLength(1);
  });
});

describe("qtyAtWarehouse", () => {
  it("reads the row for the warehouse asked for", () => {
    expect(
      qtyAtWarehouse(
        [
          { warehouseId: "wh1", qty: "5.0000" },
          { warehouseId: "wh2", qty: "7.0000" },
        ],
        "wh2",
      ),
    ).toBe("7.0000");
  });

  it("reports zero when the warehouse has never held the product", () => {
    // The backend writes no productstocks row until the first movement, so
    // "never traded here" and "traded down to nothing" mean the same thing.
    expect(qtyAtWarehouse([], "wh1")).toBe("0.0000");
  });
});
