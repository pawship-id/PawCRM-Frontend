import {
  coretPrice,
  countOrNull,
  discountPercent,
  draftToCreate,
  draftToUpdate,
  emptyPromoDraft,
  itemToInput,
  newCoretItem,
  nextTier,
  promoBlockedReason,
  promoToDraft,
  tierFor,
  type CoretItemDraft,
  type PromoDraft,
} from "@/features/promos/promoDraft";
import { promoItemsText, promoStatusLabel, weekdaysText } from "@/features/promos/labels";
import type { Promo } from "@/types/promo";

/**
 * The Harga coret form's mapping — UI on one side, the Promo V1 contract
 * (PawCRM-Backend/docs/promo-v1.md) on the other. Pure, so tested without a DOM.
 */

const TODAY = "2026-11-08";
const PRODUCT = "a".repeat(24);
const VARIANT_S = "b".repeat(24);
const VARIANT_L = "c".repeat(24);
const SERVICE = "d".repeat(24);

const item = (over: Partial<CoretItemDraft> = {}): CoretItemDraft => ({
  ...newCoretItem({ targetType: "product", refId: PRODUCT, name: "Royal Canin" }),
  value: "10",
  ...over,
});

const draft = (over: Partial<PromoDraft> = {}): PromoDraft => ({
  ...emptyPromoDraft(TODAY),
  name: "Flash Sale",
  items: [item()],
  ...over,
});

const promo = (over: Partial<Promo> = {}): Promo => ({
  id: "p1",
  code: "PRM-0001",
  name: "Senin Grooming Hemat",
  type: "coret",
  draft: false,
  status: "running",
  stoppedAt: null,
  restrictions: {
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    weekdays: [1],
    branchIds: ["br1"],
    channels: ["pos", "booking"],
    customerTypeIds: [],
    quotaTotal: 100,
    perCustomer: null,
    stackable: false,
  },
  rule: { group: [], countBy: "qty", tiers: [] },
  result: {
    target: "per_item",
    items: [
      {
        id: "i1",
        target: { targetType: "service", refId: SERVICE, variantKey: null, name: "Grooming" },
        kind: "discount_percent",
        value: null,
        priceMode: "variant",
        variantPrices: [{ productId: null, variantKey: "cat||", price: "85000.0000" }],
      },
      {
        id: "i2",
        target: { targetType: "product", refId: PRODUCT, variantKey: null, name: "Royal Canin" },
        kind: "special_price",
        value: "150000.0000",
        priceMode: "same",
        variantPrices: [],
      },
    ],
  },
  bundle: null,
  usage: { used: 3, discount: "45000.0000" },
  locked: true,
  createdAt: null,
  updatedAt: null,
  ...over,
});

describe("emptyPromoDraft", () => {
  it("opens on today, every day, Kasir only, not a draft", () => {
    const d = emptyPromoDraft(TODAY);
    expect(d.startDate).toBe(TODAY);
    expect(d.weekdays).toHaveLength(7);
    expect(d.channels).toEqual(["pos"]);
    expect(d.draft).toBe(false);
  });
});

describe("draft → payload", () => {
  it("sends every day as an empty weekdays list, and no end date as null", () => {
    const body = draftToCreate(draft());
    expect(body.type).toBe("coret");
    expect(body.restrictions.weekdays).toEqual([]);
    expect(body.restrictions.endDate).toBeNull();
    expect(body.restrictions.quotaTotal).toBeNull();
  });

  it("sends the ticked days sorted in API numbering", () => {
    const body = draftToCreate(draft({ weekdays: [3, 1] }));
    expect(body.restrictions.weekdays).toEqual([1, 3]);
  });

  it("reads an empty or zero quota as no limit", () => {
    expect(countOrNull("")).toBeNull();
    expect(countOrNull("0")).toBeNull();
    expect(countOrNull("25")).toBe(25);
  });

  it("normalises a typed value and leaves variant prices empty in same mode", () => {
    expect(itemToInput(item({ kind: "special_price", value: "150.000" }))).toEqual({
      target: { targetType: "product", refId: PRODUCT },
      kind: "special_price",
      value: "150000",
      priceMode: "same",
      variantPrices: [],
    });
  });

  it("sends a product variant by productId and a service variant by variantKey", () => {
    const product = itemToInput(
      item({ priceMode: "variant", variantPrices: { [VARIANT_S]: "90.000", [VARIANT_L]: "" } }),
    );
    expect(product.value).toBeNull();
    expect(product.variantPrices).toEqual([{ productId: VARIANT_S, price: "90000" }]);

    const service = itemToInput(
      item({ targetType: "service", refId: SERVICE, priceMode: "variant", variantPrices: { "cat||": "85000" } }),
    );
    expect(service.target).toEqual({ targetType: "service", refId: SERVICE });
    expect(service.variantPrices).toEqual([{ variantKey: "cat||", price: "85000" }]);
  });

  it("leaves items and draft out of a locked promo's PATCH", () => {
    const body = draftToUpdate(draft(), { locked: true });
    expect(body.result).toBeUndefined();
    expect(body.draft).toBeUndefined();
    expect(body.restrictions).toBeDefined();
    expect(draftToUpdate(draft(), { locked: false }).result?.items).toHaveLength(1);
  });
});

describe("promoToDraft", () => {
  it("round-trips a saved promo", () => {
    const d = promoToDraft(promo(), TODAY);
    expect(d.weekdays).toEqual([1]);
    expect(d.quotaTotal).toBe("100");
    expect(d.perCustomer).toBe("");
    expect(d.items[0]).toMatchObject({
      id: "i1",
      targetType: "service",
      priceMode: "variant",
      variantPrices: { "cat||": "85000" },
    });
    expect(d.items[1]).toMatchObject({ kind: "special_price", value: "150000" });
  });

  it("reads an every-day promo as all seven days ticked", () => {
    const d = promoToDraft(
      promo({ restrictions: { ...promo().restrictions, weekdays: [] } }),
      TODAY,
    );
    expect(d.weekdays).toHaveLength(7);
  });
});

describe("promoBlockedReason", () => {
  it("passes a complete draft", () => {
    expect(promoBlockedReason(draft())).toBeNull();
  });

  it.each([
    [{ name: " " }, "Isi nama promo"],
    [{ startDate: "" }, "Isi tanggal mulai"],
    [{ endDate: "2026-11-01" }, "Tanggal selesai tidak boleh sebelum tanggal mulai"],
    [{ weekdays: [] }, "Pilih minimal satu hari berlaku"],
    [{ items: [] }, "Tambahkan minimal satu item"],
    [{ channels: [] }, "Pilih minimal satu kanal"],
  ] as const)("%o → %s", (over, reason) => {
    expect(promoBlockedReason(draft(over as Partial<PromoDraft>))).toBe(reason);
  });

  it("names the item whose value is missing or out of range", () => {
    expect(promoBlockedReason(draft({ items: [item({ value: "" })] }))).toBe(
      "Isi nilai potongan Royal Canin",
    );
    expect(promoBlockedReason(draft({ items: [item({ value: "120" })] }))).toMatch(/maksimal 100%/);
    expect(
      promoBlockedReason(draft({ items: [item({ priceMode: "variant", variantPrices: {} })] })),
    ).toBe("Isi harga promo minimal untuk satu varian Royal Canin");
  });
});

describe("coretPrice", () => {
  it("works out %, Rp and a fixed promo price", () => {
    expect(coretPrice(item({ kind: "discount_percent", value: "10" }), "200000.0000")).toBe(180000);
    expect(coretPrice(item({ kind: "discount_amount", value: "25.000" }), "200000.0000")).toBe(175000);
    expect(coretPrice(item({ kind: "special_price", value: "150.000" }), "200000.0000")).toBe(150000);
  });

  it("leaves a variant out when the promo price is not below its normal price", () => {
    expect(coretPrice(item({ kind: "special_price", value: "150000" }), "120000.0000")).toBeNull();
  });

  it("reads a per-variant price, and a blank one as not in the promo", () => {
    const perVariant = item({ priceMode: "variant", variantPrices: { [VARIANT_S]: "90000", [VARIANT_L]: "" } });
    expect(coretPrice(perVariant, "100000.0000", VARIANT_S)).toBe(90000);
    expect(coretPrice(perVariant, "100000.0000", VARIANT_L)).toBeNull();
  });

  it("rounds the badge figure", () => {
    expect(discountPercent("100000.0000", 85000)).toBe(15);
    expect(discountPercent("100000.0000", null)).toBe(0);
  });
});

describe("labels", () => {
  it("says the weekdays in week order, and nothing for every day", () => {
    expect(weekdaysText([3, 1])).toBe("Sen, Rab");
    expect(weekdaysText([])).toBe("");
  });

  it("names the first item and counts the rest", () => {
    expect(promoItemsText(promo())).toBe("Grooming +1 item");
  });

  it("calls a stopped promo Dihentikan", () => {
    expect(promoStatusLabel({ status: "ended", stoppedAt: "2026-11-08T00:00:00Z" })).toBe("Dihentikan");
    expect(promoStatusLabel({ status: "running", stoppedAt: null })).toBe("Berjalan");
  });
});

describe("diskon bertingkat", () => {
  const TREATS = "e".repeat(24);
  const tiered = (over: Partial<PromoDraft> = {}): PromoDraft => ({
    ...emptyPromoDraft(TODAY, "tiered"),
    name: "Treats hemat",
    group: [
      { key: "g1", targetType: "product", refId: TREATS, name: "Treats 100g" },
      { key: "g2", targetType: "variant", refId: VARIANT_S, name: "Goat Milk — 200 g" },
    ],
    ...over,
  });

  it("starts with the mockup's tiers: 2 item 10%, 3 item 15%", () => {
    const fresh = emptyPromoDraft(TODAY, "tiered");
    expect(fresh.type).toBe("tiered");
    expect(fresh.tiers.map((tier) => [tier.min, tier.value])).toEqual([
      ["2", "10"],
      ["3", "15"],
    ]);
    expect(emptyPromoDraft(TODAY).tiers).toEqual([]);
  });

  it("adds a tier one item and five percent above the last", () => {
    const next = nextTier(tiered().tiers);
    expect([next.min, next.value]).toEqual(["4", "20"]);
  });

  it("sends the group and tiers as `rule`, no `result`", () => {
    const body = draftToCreate(tiered());
    expect(body.type).toBe("tiered");
    expect(body.result).toBeUndefined();
    expect(body.rule).toEqual({
      group: [
        { targetType: "product", refId: TREATS },
        { targetType: "variant", refId: VARIANT_S },
      ],
      countBy: "qty",
      tiers: [
        { min: 2, value: 10 },
        { min: 3, value: 15 },
      ],
    });
    expect(draftToUpdate(tiered(), { locked: false }).rule).toBeDefined();
    expect(draftToUpdate(tiered(), { locked: true }).rule).toBeUndefined();
  });

  it("reads a saved tiered promo back", () => {
    const saved = promoToDraft(
      promo({
        type: "tiered",
        rule: {
          group: [{ targetType: "variant", refId: VARIANT_S, variantKey: null, name: "Goat Milk — 200 g" }],
          countBy: "qty",
          tiers: [
            { min: "2.0000", value: "10.0000" },
            { min: "4.0000", value: "20.0000" },
          ],
        },
        result: { target: "same_group", items: [] },
      }),
      TODAY,
    );
    expect(saved.type).toBe("tiered");
    expect(saved.group[0]).toMatchObject({ targetType: "variant", name: "Goat Milk — 200 g" });
    expect(saved.tiers.map((tier) => [tier.min, tier.value])).toEqual([
      ["2", "10"],
      ["4", "20"],
    ]);
  });

  it("blocks an empty group and tiers that do not climb", () => {
    expect(promoBlockedReason(tiered())).toBeNull();
    expect(promoBlockedReason(tiered({ group: [] }))).toMatch(/kelompok/);
    expect(promoBlockedReason(tiered({ tiers: [{ key: "t", min: "1", value: "10" }] }))).toMatch(/paling sedikit 2/);
    expect(
      promoBlockedReason(
        tiered({
          tiers: [
            { key: "a", min: "3", value: "10" },
            { key: "b", min: "2", value: "15" },
          ],
        }),
      ),
    ).toMatch(/lebih dari 3/);
    expect(
      promoBlockedReason(
        tiered({
          tiers: [
            { key: "a", min: "2", value: "15" },
            { key: "b", min: "3", value: "10" },
          ],
        }),
      ),
    ).toMatch(/lebih dari 15%/);
  });

  it("finds the tier a basket reaches", () => {
    const { tiers } = tiered();
    expect(tierFor(tiers, 1)).toBeNull();
    expect(tierFor(tiers, 2)).toEqual({ min: 2, value: 10 });
    expect(tierFor(tiers, 7)).toEqual({ min: 3, value: 15 });
  });

  it("lists the group and its tiers in the table", () => {
    expect(
      promoItemsText(
        promo({
          type: "tiered",
          rule: {
            group: [
              { targetType: "product", refId: TREATS, variantKey: null, name: "Treats 100g" },
              { targetType: "product", refId: PRODUCT, variantKey: null, name: "Goat Milk" },
            ],
            countBy: "qty",
            tiers: [
              { min: "2.0000", value: "10.0000" },
              { min: "3.0000", value: "15.0000" },
            ],
          },
        }),
      ),
    ).toBe("Treats 100g +1 item · 2+ 10%, 3+ 15%");
  });
});
