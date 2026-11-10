import {
  POTONGAN_NONE,
  buildPromoQuoteInput,
  catalogTagLabel,
  potonganChange,
  potonganOptions,
  potonganValue,
  promoDecided,
  promoSwitches,
} from "@/features/pos/promoCart";
import { ownDiscountOf } from "@/features/pos/bookingDiscount";
import { lineKey } from "@/features/pos/membershipCart";
import { cartItemsAsInput } from "@/features/pos/hooks/cartInput";
import type { PosItem, PosTransaction } from "@/types/api";
import type { BenefitCandidate, BenefitQuoteResponse } from "@/types/membership";
import type { PromoQuoteResponse } from "@/types/promo";

/** Promo V1 at the till — the combined "potongan" rules, without a DOM. */
const line = (over: Partial<PosItem> = {}): PosItem =>
  ({
    kind: "service",
    refId: "svc-groom",
    name: "Grooming",
    sku: null,
    qty: "1.0000",
    unitPrice: "100000.0000",
    lineTotal: "100000.0000",
    discount: null,
    bookingId: null,
    parentServiceId: null,
    petId: "pet-milo",
    ...over,
  }) as PosItem;

const unlimited = {
  membershipId: "mem-1",
  benefitId: "ben-disc",
  optionId: "opt-1",
  virtual: false,
  packageRef: null,
  kind: "unlimited",
  label: "Member · Diskon 10%",
  discount: "10000.0000",
} as BenefitCandidate;

const jatah = {
  ...unlimited,
  benefitId: "ben-quota",
  kind: "quota",
  label: "Jatah Grooming 2/3",
  discount: "100000.0000",
} as BenefitCandidate;

const memberQuote = (recommended: BenefitCandidate | null = unlimited): BenefitQuoteResponse => ({
  cards: [],
  lines: [{ ref: "0", petId: "pet-milo", candidates: [jatah, unlimited], recommended }],
});

const flash = {
  promoId: "promo-flash",
  code: "PRM-1",
  name: "Flash Sale",
  label: "−15%",
  stackable: false,
  discount: "15000.0000",
};

const promoQuote = (useMember: boolean): PromoQuoteResponse => ({
  lines: [
    {
      ref: "0",
      candidates: [flash],
      recommended: useMember
        ? { promoIds: [], useMember: true, discount: "0.0000", parts: [] }
        : { promoIds: [flash.promoId], useMember: false, discount: "15000.0000", parts: [flash] },
    },
  ],
});

const cart = (items: PosItem[]) =>
  ({ customerId: "cus-1", branchId: "br-1", items }) as Pick<
    PosTransaction,
    "customerId" | "branchId" | "items"
  >;

describe("buildPromoQuoteInput", () => {
  it("asks per line, after the booking share, with the card's offer", () => {
    const input = buildPromoQuoteInput(
      cart([line({ bookingDiscount: "5000.0000" })]),
      memberQuote(),
    );
    expect(input).toEqual({
      channel: "pos",
      branchId: "br-1",
      customerId: "cus-1",
      lines: [
        {
          ref: "0",
          kind: "service",
          refId: "svc-groom",
          petId: "pet-milo",
          qty: "1.0000",
          amount: "95000.0000",
          member: { kind: "unlimited", discount: "10000.0000" },
        },
      ],
    });
  });

  it("skips membership and visit-fee lines; nothing left asks nothing", () => {
    expect(
      buildPromoQuoteInput(
        cart([line({ kind: "membership" }), line({ homeTripId: "trip-1" })]),
        null,
      ),
    ).toBeNull();
  });
});

describe("promoSwitches — a promo beating the card's unlimited benefit", () => {
  const picked = line({
    benefit: { membershipId: "mem-1", benefitId: "ben-disc", optionId: "opt-1" },
  });

  it("drops the auto-applied member pick and names the promo when it wins", () => {
    expect(promoSwitches([picked], memberQuote(), promoQuote(false))).toEqual([
      { index: 0, promoIds: ["promo-flash"] },
    ]);
  });

  it("keeps it when the card wins", () => {
    expect(promoSwitches([picked], memberQuote(), promoQuote(true))).toEqual([]);
  });

  it("never touches a jatah, a cashier's choice, or an explicit promo pick", () => {
    const onJatah = line({
      benefit: { membershipId: "mem-1", benefitId: "ben-quota", optionId: "opt-1" },
    });
    expect(promoSwitches([onJatah], memberQuote(jatah), promoQuote(false))).toEqual([]);
    expect(
      promoSwitches([picked], memberQuote(), promoQuote(false), new Set([lineKey([picked], 0)])),
    ).toEqual([]);
    expect(
      promoSwitches([{ ...picked, promoPick: [] }], memberQuote(), promoQuote(false)),
    ).toEqual([]);
  });
});

describe("the potongan select", () => {
  it("offers jatah, member, promo and Tanpa potongan", () => {
    const options = potonganOptions(line(), memberQuote().lines[0], promoQuote(false).lines[0]);
    expect(options.map((option) => [option.label, option.tone])).toEqual([
      ["Jatah Grooming 2/3", "member"],
      ["Member · Diskon 10%", "member"],
      ["Promo · Flash Sale −15%", "promo"],
      ["Tanpa potongan", "none"],
    ]);
  });

  it("offers no promo offline", () => {
    const options = potonganOptions(line(), memberQuote().lines[0], promoQuote(false).lines[0], {
      promosAllowed: false,
    });
    expect(options.some((option) => option.tone === "promo")).toBe(false);
  });

  it("reads the line: card first, then the promo on it, else none", () => {
    expect(potonganValue(line())).toBe(POTONGAN_NONE);
    expect(
      potonganValue(
        line({
          promos: [{ ...flash, type: "coret", groupRef: null }],
        }),
      ),
    ).toBe("p:promo-flash");
    expect(
      potonganValue(line({ benefit: { membershipId: "mem-1", benefitId: "ben-disc" } })),
    ).toBe("m:mbr:mem-1|ben-disc");
  });

  it("turns a choice into the write", () => {
    const quoteLine = memberQuote().lines[0];
    expect(potonganChange("p:promo-flash", quoteLine)).toEqual({
      benefit: null,
      promoIds: ["promo-flash"],
      noBenefit: true,
    });
    expect(potonganChange(POTONGAN_NONE, quoteLine)).toEqual({
      benefit: null,
      promoIds: [],
      noBenefit: true,
    });
    // A jatah takes no promo; an unlimited benefit leaves it automatic.
    expect(potonganChange("m:mbr:mem-1|ben-quota", quoteLine)?.promoIds).toEqual([]);
    expect(potonganChange("m:mbr:mem-1|ben-disc", quoteLine)).toEqual({
      benefit: { membershipId: "mem-1", benefitId: "ben-disc", optionId: "opt-1" },
      promoIds: null,
      noBenefit: false,
    });
  });

  it("does not print the promo's name twice when the server's label carries it", () => {
    const named = { ...flash, label: "Flash Sale −15%" };
    const options = potonganOptions(line(), null, {
      ref: "0",
      candidates: [named],
      recommended: { promoIds: [], useMember: false, discount: "0.0000", parts: [] },
    });
    expect(options.map((option) => option.label)).toContain("Promo · Flash Sale −15%");
  });

  describe("two 'bisa digabung' promos", () => {
    const big = {
      promoId: "promo-big",
      code: "PRM-2",
      name: "Shampoo 20%",
      label: "Shampoo 20% −20%",
      stackable: true,
      discount: "20000.0000",
    };
    const small = {
      promoId: "promo-small",
      code: "PRM-1",
      name: "Flash Sale",
      label: "Flash Sale −12%",
      stackable: true,
      discount: "12000.0000",
    };
    const quoteLine = {
      ref: "0",
      candidates: [big, small],
      recommended: {
        promoIds: [big.promoId, small.promoId],
        useMember: false,
        discount: "29600.0000",
        parts: [big, small],
      },
    };

    it("offers them together, ahead of each alone", () => {
      const options = potonganOptions(line(), null, quoteLine);
      expect(options.map((option) => option.label)).toEqual([
        "Promo · Shampoo 20% −20% + Flash Sale −12%",
        "Promo · Shampoo 20% −20%",
        "Promo · Flash Sale −12%",
        "Tanpa potongan",
      ]);
    });

    it("reads a line carrying both as the combined option, in any order", () => {
      const both = line({
        promos: [
          { ...small, type: "coret", groupRef: null },
          { ...big, type: "coret", groupRef: null },
        ],
      });
      const combined = potonganOptions(line(), null, quoteLine)[0].value;
      expect(potonganValue(both)).toBe(combined);
    });

    it("sends both, largest first, when the combined option is chosen", () => {
      const combined = potonganOptions(line(), null, quoteLine)[0].value;
      expect(potonganChange(combined, null, quoteLine)).toEqual({
        benefit: null,
        promoIds: ["promo-big", "promo-small"],
        noBenefit: true,
      });
    });

    it("offers no combined option when only one of them stacks", () => {
      const options = potonganOptions(line(), null, {
        ...quoteLine,
        candidates: [big, { ...small, stackable: false }],
      });
      expect(options.some((option) => option.label.includes(" + "))).toBe(false);
    });
  });

  it("knows a decided promo line", () => {
    expect(promoDecided(line({ promoPick: [] }))).toBe(true);
    expect(promoDecided(line({ promoPick: null }))).toBe(false);
  });
});

describe("the promo's share is not the cashier's discount", () => {
  it("subtracts promoDiscount from the line's own discount", () => {
    const item = line({
      discount: {
        mode: "amount",
        value: "20000",
        resolvedAmount: "20000.0000",
        approvedBy: null,
        source: "promo",
      },
      promoDiscount: "15000.0000",
    });
    expect(ownDiscountOf(item)?.resolvedAmount).toBe("5000.0000");
    expect(ownDiscountOf({ ...item, promoDiscount: "20000.0000" })).toBeNull();
  });

  it("re-sends the cashier's promo pick as promoIds, and nothing when automatic", () => {
    const [picked, auto] = cartItemsAsInput({
      items: [line({ promoPick: ["promo-flash"] }), line({ promoPick: null })],
    } as PosTransaction);
    expect(picked.promoIds).toEqual(["promo-flash"]);
    expect("promoIds" in auto).toBe(false);
  });
});

describe("catalogTagLabel", () => {
  it("names the days only when the promo runs on some", () => {
    expect(catalogTagLabel({ label: "−12%", weekdays: [] })).toBe("−12%");
    expect(catalogTagLabel({ label: "−15%", weekdays: [1] })).toBe("Sen −15%");
    expect(catalogTagLabel({ label: "−15%", weekdays: [3, 1] })).toBe("Sen, Rab −15%");
    expect(catalogTagLabel({ label: "−5%", weekdays: [0, 1, 2, 3, 4, 5, 6] })).toBe("−5%");
  });
});
