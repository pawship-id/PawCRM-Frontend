import {
  buildVariantCombos,
  MAX_VARIANTS,
  variantAxisValues,
  variantComboCount,
} from "@/features/services";
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
import type { PetOption, Service } from "@/types/api";

import { makePetOption, PET_OPTION_FIXTURES } from "./helpers/petOptions";

/**
 * The Varian & Harga tab's draft — the rules of the grid without the grid.
 *
 * THE AXIS VALUES ARE PASSED IN (14 September 2026): species, sizes and coats are
 * the tenant's pet options, so every case builds its table from a list of
 * options, exactly as the editor does from `usePetOptions()`.
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

/** What a new tenant is seeded with: 2 species × 3 sizes × 2 coats. */
const TABLE = variantAxisValues(PET_OPTION_FIXTURES);

const XL = makePetOption({
  type: "size",
  code: "xl",
  label: "Ekstra besar",
  sortOrder: 3,
});

/** The seeded lists with one option swapped for `replacement`. */
function withOption(replacement: PetOption): PetOption[] {
  return PET_OPTION_FIXTURES.map((option) =>
    option.type === replacement.type && option.code === replacement.code
      ? replacement
      : option,
  );
}

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
    expect(draftSignature(draft, TABLE)).toBe(
      draftSignature(seedDraft(BY_SIZE), TABLE),
    );

    // "129000" and "129.000" are one price — not a change.
    expect(
      draftSignature(updateRow(draft, "medium|", { price: "129000" }), TABLE),
    ).toBe(draftSignature(draft, TABLE));
    expect(
      draftSignature(updateRow(draft, "medium|", { price: "130000" }), TABLE),
    ).not.toBe(draftSignature(draft, TABLE));
  });

  it("says why an incomplete grid cannot be saved", () => {
    const draft = seedDraft(BY_SIZE);
    // "large" has no stored row.
    expect(draftProblem(draft, TABLE)).toBe(
      "1 varian belum punya harga yang benar",
    );
  });

  it("leaves variants for one price, carrying the first row's figures", () => {
    const flat = toggleAxis(seedDraft(BY_SIZE), "sizeCategory", false, TABLE);

    expect(flat.axes).toEqual([]);
    expect(draftProblem(flat, TABLE)).toBeNull();
    expect(draftPatch(flat, TABLE)).toEqual({
      serviceLocations: ["in_store"],
      hasVariants: false,
      price: "89000",
      durationMin: 45,
    });
  });

  it("starts a flat service's new variants from its one price", () => {
    const sized = toggleAxis(seedDraft(FLAT), "sizeCategory", true, TABLE);
    const patch = draftPatch(sized, TABLE);

    expect(patch.serviceLocations).toEqual(["in_store", "in_home"]);
    expect(patch.variants).toHaveLength(3);
    expect(patch.variants?.every((variant) => variant.price === "70000")).toBe(true);
    expect(patch.variants?.every((variant) => variant.durationMin === 20)).toBe(true);
    expect(patch).not.toHaveProperty("durationMin");
  });

  it("applies bulk changes only where they mean something", () => {
    const draft = toggleAxis(seedDraft(FLAT), "sizeCategory", true, TABLE);
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
      toggleAxis(seedDraft(FLAT), "sizeCategory", true, TABLE),
      "furType",
      true,
      TABLE,
    );
    const filled = draftPatch(fillBySize(draft, 100000, 25000, TABLE), TABLE);

    const priceOf = (size: string) =>
      filled.variants
        ?.filter((variant) => variant.sizeCategory === size)
        .map((variant) => variant.price);

    expect(priceOf("small")).toEqual(["100000", "100000"]);
    expect(priceOf("medium")).toEqual(["125000", "125000"]);
    expect(priceOf("large")).toEqual(["150000", "150000"]);
  });
});

describe("variant axis values — the tenant's lists", () => {
  it("gives a tenant-added size its own combinations, in the tenant's order", () => {
    // Listed first on purpose: the order is `sortOrder`, not arrival.
    const table = variantAxisValues([XL, ...PET_OPTION_FIXTURES]);

    expect(
      buildVariantCombos(["sizeCategory"], table).map((combo) => combo.label),
    ).toEqual(["Kecil", "Sedang", "Besar", "Ekstra besar"]);

    const both = buildVariantCombos(["sizeCategory", "furType"], table);
    expect(both).toHaveLength(8);
    expect(both.slice(-2).map((combo) => combo.key)).toEqual([
      "xl|long hair|",
      "xl|short hair|",
    ]);
    expect(both.some((combo) => combo.retired)).toBe(false);

    const draft = toggleAxis(seedDraft(FLAT), "sizeCategory", true, table);
    const patch = draftPatch(fillBySize(draft, 100000, 25000, table), table);

    // "Isi bertingkat" climbs one more step, to the new largest size.
    expect(
      patch.variants?.map((variant) => [variant.sizeCategory, variant.price]),
    ).toEqual([
      ["small", "100000"],
      ["medium", "125000"],
      ["large", "150000"],
      ["xl", "175000"],
    ]);
  });

  it("keeps a priced value whose option was retired, in its place — and a deleted one last", () => {
    const options = withOption({ ...PET_OPTION_FIXTURES[5], isActive: false });
    expect(PET_OPTION_FIXTURES[5].code).toBe("medium");

    const stored = [
      ...BY_SIZE.variants,
      // A code no live option has any more.
      { petType: null, sizeCategory: "huge", furType: null },
    ];
    const table = variantAxisValues(options, stored, (_type, code) =>
      code === "huge" ? "Raksasa" : null,
    );

    expect(table.sizeCategory).toEqual([
      { value: "small", label: "Kecil", retired: false },
      { value: "medium", label: "Sedang (nonaktif)", retired: true },
      { value: "large", label: "Besar", retired: false },
      { value: "huge", label: "Raksasa (nonaktif)", retired: true },
    ]);

    // A service that never priced it is not offered it.
    expect(
      variantAxisValues(options).sizeCategory.map((entry) => entry.value),
    ).toEqual(["small", "large"]);
  });

  it("saves a retired value's row with the rest rather than dropping it", () => {
    const options = withOption({ ...PET_OPTION_FIXTURES[5], isActive: false });
    const table = variantAxisValues(options, BY_SIZE.variants);

    expect(
      buildVariantCombos(["sizeCategory"], table).map((combo) => combo.retired),
    ).toEqual([false, true, false]);

    const draft = updateRow(seedDraft(BY_SIZE), "large|", {
      price: "150.000",
      duration: "90",
    });

    expect(draftProblem(draft, table)).toBeNull();
    expect(
      draftPatch(draft, table).variants?.map((variant) => [
        variant.sizeCategory,
        variant.price,
        variant.isActive,
      ]),
    ).toEqual([
      ["small", "89000", true],
      ["medium", "129000", false],
      ["large", "150000", true],
    ]);
  });

  it(`refuses more than ${MAX_VARIANTS} variants, whatever is typed — and allows exactly ${MAX_VARIANTS}`, () => {
    const species = (code: string, label: string, sortOrder: number) =>
      makePetOption({ type: "species", code, label, sortOrder });
    const size = (code: string, label: string, sortOrder: number) =>
      makePetOption({ type: "size", code, label, sortOrder });

    // 3 species × 4 sizes × 2 coats = 24.
    const wide = variantAxisValues([
      ...PET_OPTION_FIXTURES,
      species("rabbit", "Kelinci", 2),
      XL,
    ]);
    const all = ["petType", "sizeCategory", "furType"] as const;

    expect(variantComboCount([...all], wide)).toBe(24);

    const tooMany = all.reduce(
      (draft, axis) => toggleAxis(draft, axis, true, wide),
      seedDraft(FLAT),
    );
    // Every row starts from the flat price, so only the count is wrong.
    expect(draftProblem(tooMany, wide)).toBe(
      `kombinasinya jadi 24 varian, maksimal ${MAX_VARIANTS} per layanan`,
    );
    expect(
      draftProblem(toggleAxis(tooMany, "petType", false, wide), wide),
    ).toBeNull();

    // 4 species × 5 sizes = 20, the limit itself.
    const twenty = variantAxisValues([
      ...PET_OPTION_FIXTURES,
      species("rabbit", "Kelinci", 2),
      species("bird", "Burung", 3),
      XL,
      size("xxl", "Raksasa", 4),
    ]);
    const atLimit = toggleAxis(
      toggleAxis(seedDraft(FLAT), "petType", true, twenty),
      "sizeCategory",
      true,
      twenty,
    );

    expect(variantComboCount(atLimit.axes, twenty)).toBe(MAX_VARIANTS);
    expect(draftProblem(atLimit, twenty)).toBeNull();
  });
});
