import {
  invoiceAutoApply,
  invoiceBenefitQuoteLines,
  invoicePromoSwitches,
  rowPromoOf,
  type BenefitQuoteRow,
} from "@/features/sales/invoicePromo";
import type { BenefitCandidate, BenefitQuoteResponse } from "@/types/membership";
import type { PromoQuoteLine, PromoQuoteResponse } from "@/types/promo";

/**
 * Faktur baru — membership benefits and promos follow the till's rules
 * (20 November 2026, "treatment sama dengan kasir").
 */

const row = (over: Partial<BenefitQuoteRow> = {}): BenefitQuoteRow => ({
  key: "r1",
  kind: "service",
  refId: "svc-1",
  petId: "pet-1",
  qty: "1",
  unitPrice: "100000",
  addonOf: null,
  ride: false,
  benefit: null,
  ...over,
});

const candidate = (over: Partial<BenefitCandidate> = {}): BenefitCandidate =>
  ({
    membershipId: "card-1",
    membershipNumber: "MBR-1",
    virtual: false,
    packageRef: null,
    planName: "Gold",
    attachTo: "pet",
    benefitId: "ben-1",
    benefitLabel: "Diskon 10%",
    optionId: "opt-1",
    optionKind: "discount",
    kind: "unlimited",
    label: "Member · Diskon 10%",
    discount: "10000.0000",
    ...over,
  }) as BenefitCandidate;

const memberQuote = (lines: Array<{ ref: string; candidates: BenefitCandidate[] }>) =>
  ({
    cards: [],
    lines: lines.map((line) => ({
      ref: line.ref,
      candidates: line.candidates,
      recommended: line.candidates[0] ?? null,
      unavailable: [],
    })),
  }) as unknown as BenefitQuoteResponse;

describe("invoiceBenefitQuoteLines — every row, like the till", () => {
  it("asks about goods, with no animal, and sends the quantity", () => {
    const [line] = invoiceBenefitQuoteLines([
      row({ kind: "product", refId: "prod-1", petId: "", qty: "3", unitPrice: "20000" }),
    ]);
    expect(line).toMatchObject({ ref: "r1", kind: "product", petId: null, qty: 3 });
    expect(Number(line.amount)).toBe(60000);
  });

  it("sends an add-on as `addon` under its service", () => {
    const [line] = invoiceBenefitQuoteLines([row({ refId: "addon-1", addonOf: "svc-1" })]);
    expect(line).toMatchObject({ kind: "addon", parentServiceId: "svc-1", petId: "pet-1" });
  });

  it("leaves out a service with no animal yet and a package row", () => {
    expect(
      invoiceBenefitQuoteLines([row({ petId: "" }), row({ key: "r2", kind: "membership" })]),
    ).toEqual([]);
  });

  it("pins the row's pick, and says Tanpa potongan", () => {
    const [pinned, none] = invoiceBenefitQuoteLines([
      row({
        benefit: {
          membershipId: "card-1",
          benefitId: "ben-1",
          optionId: "opt-1",
          amount: "1",
          benefitLabel: null,
        },
      }),
      row({ key: "r2", noBenefit: true }),
    ]);
    expect(pinned).toMatchObject({ membershipId: "card-1", benefitId: "ben-1", optionId: "opt-1" });
    expect(none.noBenefit).toBe(true);
  });
});

describe("invoiceAutoApply — the best benefit goes on by itself", () => {
  it("applies the recommendation on a row nobody decided for", () => {
    const changes = invoiceAutoApply([row()], memberQuote([{ ref: "r1", candidates: [candidate()] }]));
    expect(changes).toEqual([
      {
        key: "r1",
        benefit: expect.objectContaining({ membershipId: "card-1", benefitId: "ben-1", amount: "10000.0000" }),
      },
    ]);
  });

  it("leaves a Tanpa potongan row and a row with a typed discount alone", () => {
    const quote = memberQuote([
      { ref: "r1", candidates: [candidate()] },
      { ref: "r2", candidates: [candidate()] },
    ]);
    expect(
      invoiceAutoApply([row({ noBenefit: true }), { ...row({ key: "r2" }), discountValue: "5" }], quote),
    ).toEqual([]);
  });

  it("drops a pick the quote no longer offers, and refreshes a moved figure", () => {
    const pick = {
      membershipId: "card-1",
      benefitId: "ben-1",
      optionId: "opt-1",
      amount: "10000.0000",
      benefitLabel: null,
    };
    expect(
      invoiceAutoApply([row({ benefit: pick })], memberQuote([{ ref: "r1", candidates: [] }])),
    ).toEqual([{ key: "r1", benefit: null }]);

    const [refresh] = invoiceAutoApply(
      [row({ benefit: pick, qty: "2" })],
      memberQuote([{ ref: "r1", candidates: [candidate({ discount: "20000.0000" })] }]),
    );
    expect(refresh.benefit?.amount).toBe("20000.0000");
  });
});

const promoLine = (over: Partial<PromoQuoteLine["recommended"]> = {}): PromoQuoteLine => ({
  ref: "r1",
  candidates: [
    { promoId: "p1", code: "A", name: "Flash", label: "Flash −15%", stackable: false, discount: "15000.0000" },
    { promoId: "p2", code: "B", name: "Extra", label: "Extra −5%", stackable: true, discount: "5000.0000" },
  ],
  recommended: {
    promoIds: ["p1"],
    useMember: false,
    discount: "15000.0000",
    parts: [],
    ...over,
  },
});

describe("invoicePromoSwitches — a promo beating an unlimited benefit", () => {
  const pick = { membershipId: "card-1", benefitId: "ben-1", amount: "10000.0000" };
  const quote = memberQuote([{ ref: "r1", candidates: [candidate()] }]);
  const base = { key: "r1", kind: "service" as const, refId: "svc-1", qty: "1", unitPrice: "100000" };

  it("swaps to the promo when nobody chose", () => {
    const promo: PromoQuoteResponse = { lines: [promoLine()] };
    expect(invoicePromoSwitches([{ ...base, benefit: pick }], quote, promo)).toEqual([
      { key: "r1", promoIds: ["p1"] },
    ]);
  });

  it("never swaps a jatah or a row somebody chose", () => {
    const promo: PromoQuoteResponse = { lines: [promoLine()] };
    const jatah = memberQuote([{ ref: "r1", candidates: [candidate({ kind: "quota" })] }]);
    expect(invoicePromoSwitches([{ ...base, benefit: pick }], jatah, promo)).toEqual([]);
    expect(invoicePromoSwitches([{ ...base, benefit: pick, chosen: true }], quote, promo)).toEqual([]);
  });
});

describe("rowPromoOf — a picked promo", () => {
  const base = { key: "r1", kind: "product" as const, refId: "p", qty: "1", unitPrice: "100000", benefit: null };

  it("prices the promo picked on the row, and none for []", () => {
    const line = promoLine({ useMember: true });
    expect(rowPromoOf({ ...base, promoPick: ["p2"] }, line, null).discount).toBe("5000.0000");
    expect(rowPromoOf({ ...base, promoPick: [] }, line, null).discount).toBe("0");
  });
});
