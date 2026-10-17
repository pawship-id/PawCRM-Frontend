import {
  benefitToDraft,
  choiceToQuota,
  draftToBenefitInput,
  draftToOptionInput,
  draftToPayload,
  estimatePlan,
  newBenefitDraft,
  newOptionDraft,
  normalizeMoney,
  planBlockedReason,
  planToDraft,
  quotaToChoice,
  specialPriceAllowed,
  type BenefitDraft,
  type OptionDraft,
} from "@/features/memberships/planDraft";
import {
  matchVariantPrice,
  servicePriceFor,
  serviceVariantPrices,
} from "@/features/memberships/variantKey";
import type { Service } from "@/types/api";
import type { MembershipBenefit, MembershipPlan } from "@/types/membership";

/**
 * The benefit builder's mapping — UI on one side, the V1 contract
 * (PawCRM-Backend/docs/membership-v1.md §2.2) on the other. Pure, so tested
 * without a DOM.
 */

const CAT = "a".repeat(24);
const DOG = "b".repeat(24);
const SMALL = "c".repeat(24);

const option = (over: Partial<OptionDraft> = {}): OptionDraft => ({
  ...newOptionDraft(),
  scope: { target: "service", serviceIds: ["svc-basic"], productIds: [], categoryIds: [], serviceKinds: [] },
  ...over,
});

const benefit = (over: Partial<BenefitDraft> = {}): BenefitDraft => ({
  ...newBenefitDraft(),
  label: "Grooming",
  options: [option()],
  ...over,
});

describe("quota mapping (UI period ↔ backend quota)", () => {
  it.each([
    ["week", "2", { perPeriod: 2, period: "week", total: null }],
    ["month", "1", { perPeriod: 1, period: "month", total: null }],
    ["term", "4", { total: 4, perPeriod: null, period: null }],
    ["unlimited", "", { total: null, perPeriod: null, period: null }],
  ] as const)("%s × %s", (choice, count, quota) => {
    expect(choiceToQuota(choice, count)).toEqual(quota);
  });

  it("keeps a lifetime cap on top of a period quota, and drops one below the count", () => {
    expect(choiceToQuota("month", "1", "12")).toEqual({ perPeriod: 1, period: "month", total: 12 });
    expect(choiceToQuota("month", "3", "2")).toEqual({ perPeriod: 3, period: "month", total: null });
  });

  it("never widens an empty count on a limited choice into 'unlimited'", () => {
    expect(choiceToQuota("month", "")).toEqual({ perPeriod: 1, period: "month", total: null });
  });

  it("reads every API shape back into the four choices", () => {
    expect(quotaToChoice({ perPeriod: 2, period: "week", total: null })).toEqual({
      choice: "week",
      count: "2",
      totalCap: "",
    });
    expect(quotaToChoice({ perPeriod: 1, period: "month", total: 24 })).toEqual({
      choice: "month",
      count: "1",
      totalCap: "24",
    });
    expect(quotaToChoice({ perPeriod: null, period: null, total: 6 })).toEqual({
      choice: "term",
      count: "6",
      totalCap: "",
    });
    expect(quotaToChoice({ perPeriod: null, period: null, total: null }).choice).toBe("unlimited");
  });

  it("round-trips", () => {
    for (const quota of [
      { perPeriod: 1, period: "month" as const, total: null },
      { perPeriod: 2, period: "week" as const, total: 10 },
      { perPeriod: null, period: null, total: 5 },
      { perPeriod: null, period: null, total: null },
    ]) {
      const { choice, count, totalCap } = quotaToChoice(quota);
      expect(choiceToQuota(choice, count, totalCap)).toEqual(quota);
    }
  });
});

describe("option payload", () => {
  it("free_item sends no value and no variant rows", () => {
    expect(draftToOptionInput(option({ id: "opt-1", visitFee: "free" }))).toEqual({
      id: "opt-1",
      kind: "free_item",
      scope: { target: "service", serviceIds: ["svc-basic"], productIds: [], categoryIds: [], serviceKinds: [] },
      value: null,
      priceMode: "same",
      variantPrices: [],
      visitFee: "free",
    });
  });

  it("a percent is a JSON number; a rupiah amount a clean decimal string", () => {
    expect(draftToOptionInput(option({ kind: "discount_percent", value: "12,5" })).value).toBe(12.5);
    expect(draftToOptionInput(option({ kind: "discount_amount", value: "Rp 20.000" })).value).toBe("20000");
  });

  it("special price, same for every variant", () => {
    const input = draftToOptionInput(option({ kind: "special_price", value: "120.000" }));
    expect(input).toMatchObject({ kind: "special_price", priceMode: "same", value: "120000", variantPrices: [] });
  });

  it("special price per variant sends its rows (empty ones dropped) and the optional fallback", () => {
    const input = draftToOptionInput(
      option({
        kind: "special_price",
        priceMode: "variant",
        value: "",
        variantPrices: [
          { variantKey: `${CAT}||`, price: "90.000" },
          { variantKey: `${DOG}||`, price: "" },
        ],
      }),
    );
    expect(input).toMatchObject({
      priceMode: "variant",
      value: null,
      variantPrices: [{ variantKey: `${CAT}||`, price: "90000" }],
    });
  });

  it("'Semua add-on' is an empty add-on scope; 'Apa saja' drops every list", () => {
    expect(
      draftToOptionInput(option({ scope: { target: "addon", serviceIds: [], productIds: [], categoryIds: [], serviceKinds: [] } }))
        .scope,
    ).toEqual({ target: "addon", serviceIds: [], productIds: [], categoryIds: [], serviceKinds: [] });
    expect(
      draftToOptionInput(
        option({ scope: { target: "any", serviceIds: ["x"], productIds: ["y"], categoryIds: [], serviceKinds: ["grooming"] } }),
      ).scope,
    ).toEqual({ target: "any", serviceIds: [], productIds: [], categoryIds: [], serviceKinds: [] });
  });

  it("harga khusus needs a named service or product", () => {
    expect(specialPriceAllowed({ target: "addon", serviceIds: [], productIds: [], categoryIds: [], serviceKinds: [] })).toBe(false);
    expect(specialPriceAllowed({ target: "service", serviceIds: [], productIds: [], categoryIds: [], serviceKinds: ["grooming"] })).toBe(false);
    expect(specialPriceAllowed({ target: "service", serviceIds: ["s"], productIds: [], categoryIds: [], serviceKinds: [] })).toBe(true);
  });
});

describe("benefit payload", () => {
  it("sends options, the mapped quota and the ids that keep the ledger attached", () => {
    const input = draftToBenefitInput(
      benefit({
        id: "ben-1",
        quotaChoice: "month",
        quotaCount: "1",
        maxPerTransaction: "2",
        options: [option({ id: "opt-1" }), option({ kind: "special_price", value: "120000", scope: { target: "service", serviceIds: ["svc-full"], productIds: [], categoryIds: [], serviceKinds: [] } })],
      }),
    );

    expect(input.id).toBe("ben-1");
    expect(input.kind).toBeUndefined();
    expect(input.quota).toEqual({ perPeriod: 1, period: "month", total: null });
    expect(input.maxPerTransaction).toBe(2);
    expect(input.options).toHaveLength(2);
    expect(input.options?.[0].id).toBe("opt-1");
    expect(input.options?.[1].id).toBeUndefined();
  });

  it("a Fasilitas is a perk with no options and no quota", () => {
    expect(draftToBenefitInput(benefit({ type: "perk", label: "Prioritas booking" }))).toEqual({
      label: "Prioritas booking",
      kind: "perk",
    });
  });

  it("reads a saved benefit — a legacy one included — back into a draft", () => {
    const saved: MembershipBenefit = {
      id: "ben-9",
      label: "Mandi",
      kind: "discount_percent",
      scope: { target: "service", serviceIds: [], productIds: [], categoryIds: [], serviceKinds: ["grooming"] },
      value: 10,
      quota: { total: null, perPeriod: 2, period: "week" },
      maxPerTransaction: 1,
      options: [
        {
          id: "ben-9",
          kind: "discount_percent",
          scope: { target: "service", serviceIds: [], productIds: [], categoryIds: [], serviceKinds: ["grooming"] },
          value: 10,
          priceMode: "same",
          variantPrices: [],
          visitFee: "zone",
          summary: "Diskon 10%",
        },
      ],
      summary: "Diskon 10% · 2× per minggu",
    };
    const draft = benefitToDraft(saved);

    expect(draft).toMatchObject({ id: "ben-9", type: "allowance", quotaChoice: "week", quotaCount: "2" });
    expect(draft.options[0]).toMatchObject({ id: "ben-9", kind: "discount_percent", value: "10" });
    expect(draftToBenefitInput(draft).options?.[0]).toMatchObject({ id: "ben-9", value: 10 });
  });
});

describe("plan payload", () => {
  const base = () => ({
    ...planToDraft(),
    name: "Explorer",
    price: "450.000",
    benefits: [benefit()],
  });

  it("a new plan with no code asks the server to number it", () => {
    const payload = draftToPayload(base());
    expect(payload.code).toBe("");
    expect(payload).toMatchObject({
      name: "Explorer",
      price: "450000",
      priceMode: "fixed",
      variantPrices: [],
      durationMonths: 6,
      attachTo: "pet",
      eligibility: "all",
      publicDisplay: { visible: false, featured: false, order: 0, badge: null },
    });
  });

  it("an edit with the code cleared keeps the code it has", () => {
    expect("code" in draftToPayload(base(), { editing: true })).toBe(false);
    expect(draftToPayload({ ...base(), code: "msp-7" }, { editing: true }).code).toBe("MSP-7");
  });

  it("per-variant pricing sends rows, not a price", () => {
    const payload = draftToPayload({
      ...base(),
      priceMode: "variant",
      variantPrices: [{ variantKey: `${CAT}||`, price: "750.000" }],
    });
    expect(payload.price).toBeUndefined();
    expect(payload).toMatchObject({ priceMode: "variant", variantPrices: [{ variantKey: `${CAT}||`, price: "750000" }] });
  });

  it("a customer plan is always one price and names no species", () => {
    const payload = draftToPayload({
      ...base(),
      attachTo: "customer",
      priceMode: "variant",
      petSpecies: [CAT],
    });
    expect(payload).toMatchObject({ attachTo: "customer", priceMode: "fixed", petSpecies: [], price: "450000" });
  });

  it("an old day-based plan opens on months", () => {
    const draft = planToDraft({
      ...({} as MembershipPlan),
      id: "p1",
      code: "OLD",
      name: "Lama",
      price: "100000.0000",
      durationDays: 365,
      durationMonths: null,
      benefits: [],
      isActive: true,
      renewalOfferDays: 30,
    } as MembershipPlan);
    expect(draft.durationMonths).toBe("12");
    expect(draft.price).toBe("100000");
    expect(draft.attachTo).toBe("pet");
  });

  it("says what still blocks a save, in form order", () => {
    expect(planBlockedReason({ ...base(), name: "" })).toBe("Isi nama paketnya dulu.");
    expect(planBlockedReason({ ...base(), price: "" })).toBe("Isi harga paketnya.");
    expect(planBlockedReason({ ...base(), benefits: [benefit({ label: "" })] })).toBe(
      "Benefit 1: isi namanya.",
    );
    expect(
      planBlockedReason({
        ...base(),
        benefits: [benefit({ options: [option({ kind: "discount_percent", value: "150" })] })],
      }),
    ).toBe("Benefit 1: isi persen diskon (1–100).");
    expect(planBlockedReason(base())).toBeNull();
  });
});

describe("money and variant keys", () => {
  it("normalises Indonesian figures and API decimals", () => {
    expect(normalizeMoney("Rp 1.250.000")).toBe("1250000");
    expect(normalizeMoney("1250000,50")).toBe("1250000.5");
    expect(normalizeMoney("450000.0000")).toBe("450000");
    expect(normalizeMoney("150.000")).toBe("150000");
    expect(normalizeMoney("")).toBe("");
  });

  it("the most specific variant row wins; an empty segment means any", () => {
    const rows = [
      { variantKey: `${CAT}||`, price: "100000" },
      { variantKey: `${CAT}|${SMALL}|`, price: "80000" },
    ];
    expect(matchVariantPrice(rows, `${CAT}|${SMALL}|x`)).toBe("80000");
    expect(matchVariantPrice(rows, `${CAT}||`)).toBe("100000");
    expect(matchVariantPrice(rows, `${DOG}|${SMALL}|`)).toBeNull();
  });

  it("reads a service grid as variant rows, cheapest per key across zones", () => {
    const service = {
      hasVariants: true,
      price: null,
      variants: [
        { petType: CAT, sizeCategory: SMALL, furType: null, price: "90000.0000", isActive: true, zoneId: "z1" },
        { petType: CAT, sizeCategory: SMALL, furType: null, price: "80000.0000", isActive: true, zoneId: "z2" },
        { petType: DOG, sizeCategory: null, furType: null, price: "150000.0000", isActive: false },
      ],
    } as unknown as Service;

    expect(serviceVariantPrices(service)).toEqual([
      { variantKey: `${CAT}|${SMALL}|`, price: "80000.0000" },
    ]);
    expect(servicePriceFor(service, `${CAT}|${SMALL}|`)).toBe("80000.0000");
    expect(servicePriceFor({ hasVariants: false, price: "50000.0000", variants: [] } as unknown as Service, null)).toBe(
      "50000.0000",
    );
  });
});

describe("preview estimate", () => {
  const grooming = {
    _id: "svc-basic",
    hasVariants: true,
    price: null,
    variants: [{ petType: CAT, sizeCategory: null, furType: null, price: "100000.0000", isActive: true }],
  } as unknown as Service;
  const services = new Map([["svc-basic", grooming]]);

  it("values every allowance used, dearest option each time, against the plan price", () => {
    const draft = {
      ...planToDraft(),
      name: "Explorer",
      durationMonths: "6",
      price: "450000",
      benefits: [
        benefit({ quotaChoice: "month", quotaCount: "1" }),
        benefit({
          quotaChoice: "unlimited",
          options: [option({ kind: "discount_percent", value: "10" })],
        }),
      ],
    };

    const estimate = estimatePlan(draft, `${CAT}||`, services);
    expect(estimate).toMatchObject({
      perMonth: 100000,
      total: 600000,
      price: 450000,
      saving: 150000,
      hasUnlimited: true,
    });
  });

  it("leaves out what it cannot price", () => {
    const draft = {
      ...planToDraft(),
      price: "100000",
      benefits: [
        benefit({
          options: [option({ scope: { target: "addon", serviceIds: [], productIds: [], categoryIds: [], serviceKinds: [] } })],
        }),
      ],
    };
    const estimate = estimatePlan(draft, `${CAT}||`, services);
    expect(estimate.total).toBe(0);
    expect(estimate.hasUnpriced).toBe(true);
  });
});
