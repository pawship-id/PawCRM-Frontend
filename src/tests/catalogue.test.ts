import {
  defaultVariantSku,
  skuPrefix,
} from "@/features/inventory/utils/catalogue";

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
