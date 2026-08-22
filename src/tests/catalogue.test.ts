import {
  availabilitySpread,
  defaultVariantSku,
  limitedByAt,
  qtyIn,
  skuPrefix,
  stockOf,
} from "@/features/inventory/utils/catalogue";
import type { Product } from "@/types/inventory";

/**
 * The seed for a family's variant SKUs.
 *
 * A parent needs no SKU of its own, so leaving that field empty is the ordinary
 * case rather than an oversight — which makes the fallback load-bearing: twelve
 * rows all seeded "SKU-…" are twelve rows the user has to retype. These pin the
 * fallback, and pin the sanitising that keeps the result inside what the API
 * accepts (`^[A-Z0-9][A-Z0-9._-]{0,39}$`, 40 characters).
 */
describe("skuPrefix", () => {
  it("prefers the parent's own SKU when it has one", () => {
    expect(skuPrefix("rc-adult", "Royal Canin Adult")).toBe("RC-ADULT");
  });

  it("falls back to the product name when the parent has no SKU", () => {
    expect(skuPrefix("", "Royal Canin Adult")).toBe("ROYALCANINADULT");
  });

  it("ignores a SKU that is only whitespace", () => {
    expect(skuPrefix("   ", "Makanan Kucing")).toBe("MAKANANKUCING");
  });

  it("strips what a SKU may not contain", () => {
    // Spaces, punctuation and accents would all be refused by the API pattern,
    // and a 400 on a field the user never typed into is unexplainable.
    expect(skuPrefix("", "Whiskas 1+ (Tuna) / Ayam")).toBe("WHISKAS1TUNAAYAM");
  });

  it("caps the name so the combination still fits in 40 characters", () => {
    const prefix = skuPrefix("", "Makanan Kucing Premium Import Terbaik");

    expect(prefix).toHaveLength(16);
    expect(
      defaultVariantSku(prefix, ["10 KG", "Chicken"]).length,
    ).toBeLessThanOrEqual(40);
  });

  it("falls back to SKU when the name has nothing usable in it", () => {
    expect(skuPrefix("", "—")).toBe("SKU");
    expect(skuPrefix("", "")).toBe("SKU");
  });
});

describe("defaultVariantSku", () => {
  it("joins the prefix to the combination, uppercased and unspaced", () => {
    expect(defaultVariantSku("RC", ["3 kg", "Chicken"])).toBe("RC-3KG-CHICKEN");
  });
});

/**
 * What "Stok" adds up to over a warehouse scope — the arithmetic behind the
 * number on every catalogue row, including the one the screen opens on.
 */
describe("qtyIn", () => {
  const ROWS = [
    { warehouseId: "wh1", qty: "14.5000" },
    { warehouseId: "wh2", qty: "3.2500" },
    { warehouseId: "wh3", qty: "2.0000" },
  ];

  it("reads one warehouse's row when one is picked", () => {
    expect(qtyIn(ROWS, ["wh2"])).toBe("3.2500");
  });

  it("adds up exactly the warehouses picked, and no others", () => {
    // The point of the multi-select: "can these two branches cover it between
    // them" is one number, not two the user adds up by hand.
    expect(qtyIn(ROWS, ["wh1", "wh3"])).toBe("16.5000");
  });

  it("treats an empty scope as every warehouse", () => {
    expect(qtyIn(ROWS, [])).toBe("19.7500");
  });

  it("ignores a warehouse the product has no row in", () => {
    // Absent means "never had stock there", which is zero — not unknown.
    expect(qtyIn(ROWS, ["wh1", "nowhere"])).toBe("14.5000");
    expect(qtyIn(ROWS, ["nowhere"])).toBe("0.0000");
  });

  it("sums exactly, not through a float", () => {
    // 0.1 + 0.2 through Number is 0.30000000000000004, and a stock column is
    // the last place that should appear.
    expect(
      qtyIn(
        [
          { warehouseId: "wh1", qty: "0.1000" },
          { warehouseId: "wh2", qty: "0.2000" },
        ],
        [],
      ),
    ).toBe("0.3000");
  });

  it("is zero, not an em dash, for a product with no rows at all", () => {
    expect(qtyIn([], [])).toBe("0.0000");
    expect(qtyIn(undefined, [])).toBe("0.0000");
  });
});

function bundle(): Product {
  return {
    _id: "b1",
    isConsignment: false,
    sku: "PAKET",
    name: "Paket Hemat",
    productType: "bundle",
    parentId: null,
    variantAxes: [],
    variantAttributes: null,
    bundleConfig: null,
    barcode: null,
    minStock: 0,
    hasExpiry: false,
    categoryId: "c1",
    unit: "paket",
    sellPrice: "430000.0000",
    hppAvg: null,
    isActive: true,
    deletedAt: null,
    stockByWarehouse: [],
    bundleAvailability: [
      { warehouseId: "wh1", qty: "4.0000", limitedBy: "p1" },
      { warehouseId: "wh2", qty: "3.0000", limitedBy: "p2" },
    ],
  };
}

describe("stockOf and limitedByAt over a scope", () => {
  it("sums a bundle's buildable count — an upper bound, said so on screen", () => {
    // Components cannot be pooled across locations, so seven is not seven
    // bundles anybody can assemble. The table prints "dijumlah per gudang"
    // beside it for exactly this reason.
    expect(stockOf(bundle(), [])).toBe("7.0000");
    expect(stockOf(bundle(), ["wh2"])).toBe("3.0000");
  });

  it("names the limiting component only when one warehouse is left to cap", () => {
    expect(limitedByAt(bundle(), ["wh2"])).toBe("p2");
    // Each location ran out of something different; naming one of them beside
    // a total spanning both would be a claim about the total that is not true.
    expect(limitedByAt(bundle(), [])).toBeNull();
    expect(limitedByAt(bundle(), ["wh1", "wh2"])).toBeNull();
  });

  it("still names the cap when the scope happens to leave one warehouse", () => {
    // A bundle whose components only live in one place has an unambiguous cap
    // even under "Semua gudang" — one row IS the whole answer.
    const single = bundle();
    single.bundleAvailability = [
      { warehouseId: "wh1", qty: "4.0000", limitedBy: "p1" },
    ];

    expect(limitedByAt(single, [])).toBe("p1");
    expect(availabilitySpread(single, [])).toBe(1);
  });

  it("counts the warehouses a bundle figure spans, which is what earns the note", () => {
    expect(availabilitySpread(bundle(), [])).toBe(2);
    expect(availabilitySpread(bundle(), ["wh1"])).toBe(1);
    // A picked warehouse the bundle has no availability row in contributes
    // nothing, so the note does not appear for a scope that spans one row.
    expect(availabilitySpread(bundle(), ["wh1", "nowhere"])).toBe(1);
  });
});
