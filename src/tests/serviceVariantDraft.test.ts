import {
  applyBulk,
  draftPatch,
  draftProblem,
  draftSignature,
  durationValue,
  fillBySize,
  priceDigits,
  priceText,
  seedDraft,
  toggleAxis,
  updateRow,
} from "@/features/grooming/serviceVariantDraft";
import type { Service } from "@/types/api";

/**
 * The Varian & Harga tab's draft — the rules of the grid without the grid.
 */
const BY_SIZE = {
  _id: "svc-1",
  price: null,
  durationMin: null,
  hasVariants: true,
  variantAxes: ["sizeCategory"],
  serviceLocations: ["in_store"],
  variants: [
    { petType: null, sizeCategory: "small", furType: null, price: "89000.0000", durationMin: 45, isActive: true },
    { petType: null, sizeCategory: "medium", furType: null, price: "129000.0000", durationMin: 60, isActive: false },
  ],
} as unknown as Service;

const FLAT = {
  _id: "svc-2",
  price: "70000.0000",
  durationMin: 20,
  hasVariants: false,
  variantAxes: [],
  variants: [],
  serviceLocations: ["in_store", "in_home"],
} as unknown as Service;

describe("serviceVariantDraft", () => {
  it("reads prices the way they are written here: dots are thousands", () => {
    expect(priceText("139000.0000")).toBe("139.000");
    expect(priceDigits("139.000")).toBe("139000");
    expect(priceDigits("139000")).toBe("139000");
    expect(priceDigits("13.90")).toBeNull();
    expect(priceDigits("139,5")).toBeNull();
    expect(priceDigits("")).toBeNull();
  });

  it("takes minutes from one to a day", () => {
    expect(durationValue("45")).toBe(45);
    expect(durationValue("0")).toBeNull();
    expect(durationValue("1441")).toBeNull();
    expect(durationValue("4.5")).toBeNull();
  });

  it("seeds from the stored service, and an unchanged draft signs the same", () => {
    const draft = seedDraft(BY_SIZE);

    expect(draft.place).toBe("store");
    expect(draft.rows["medium|"]).toEqual({
      price: "129.000",
      duration: "60",
      active: false,
    });
    expect(draftSignature(draft)).toBe(draftSignature(seedDraft(BY_SIZE)));

    // "129000" and "129.000" are one price — not a change.
    expect(
      draftSignature(updateRow(draft, "medium|", { price: "129000" })),
    ).toBe(draftSignature(draft));
    expect(
      draftSignature(updateRow(draft, "medium|", { price: "130000" })),
    ).not.toBe(draftSignature(draft));
  });

  it("says why an incomplete grid cannot be saved", () => {
    const draft = seedDraft(BY_SIZE);
    // "large" has no stored row.
    expect(draftProblem(draft)).toBe("1 varian belum punya harga yang benar");
  });

  it("leaves variants for one price, carrying the first row's figures", () => {
    const flat = toggleAxis(seedDraft(BY_SIZE), "sizeCategory", false);

    expect(flat.axes).toEqual([]);
    expect(draftProblem(flat)).toBeNull();
    expect(draftPatch(flat)).toEqual({
      serviceLocations: ["in_store"],
      hasVariants: false,
      price: "89000",
      durationMin: 45,
    });
  });

  it("starts a flat service's new variants from its one price", () => {
    const sized = toggleAxis(seedDraft(FLAT), "sizeCategory", true);
    const patch = draftPatch(sized);

    expect(patch.serviceLocations).toEqual(["in_store", "in_home"]);
    expect(patch.variants).toHaveLength(3);
    expect(patch.variants?.every((variant) => variant.price === "70000")).toBe(true);
    expect(patch.variants?.every((variant) => variant.durationMin === 20)).toBe(true);
    expect(patch).not.toHaveProperty("durationMin");
  });

  it("applies bulk changes only where they mean something", () => {
    const draft = toggleAxis(seedDraft(FLAT), "sizeCategory", true);
    const keys = Object.keys(draft.rows);
    const blanked = updateRow(draft, keys[2], { price: "" });

    const cheaper = applyBulk(blanked, keys, { kind: "rupiah", delta: -100000 });
    expect(cheaper.rows[keys[0]].price).toBe("0");
    // A row with no price is not treated as zero.
    expect(cheaper.rows[keys[2]].price).toBe("");

    const off = applyBulk(draft, keys.slice(0, 2), { kind: "toggle" });
    expect(off.rows[keys[0]].active).toBe(false);
    expect(applyBulk(off, keys.slice(0, 2), { kind: "toggle" }).rows[keys[0]].active).toBe(true);
  });

  it("fills prices by size, a step up per size, whatever else a row varies by", () => {
    const draft = toggleAxis(
      toggleAxis(seedDraft(FLAT), "sizeCategory", true),
      "furType",
      true,
    );
    const filled = draftPatch(fillBySize(draft, 100000, 25000));

    const priceOf = (size: string) =>
      filled.variants
        ?.filter((variant) => variant.sizeCategory === size)
        .map((variant) => variant.price);

    expect(priceOf("small")).toEqual(["100000", "100000"]);
    expect(priceOf("medium")).toEqual(["125000", "125000"]);
    expect(priceOf("large")).toEqual(["150000", "150000"]);
  });
});
