import { benefitRows } from "@/features/pos/components/PosBenefitSection";
import type { PosItem } from "@/types/api";
import type { BenefitQuoteResponse } from "@/types/membership";

/**
 * What the Benefit membership section offers, and what it refuses.
 *
 * PURE, so it is tested without a DOM — the reason `benefitRows` is exported
 * apart from the component that draws it.
 */
const CARD = "card-1";

const benefit = (over: Record<string, unknown> = {}) =>
  ({
    id: "ben-1",
    label: "Gratis Grooming Lengkap",
    kind: "free_item",
    scope: { target: "service", serviceIds: [], productIds: [], categoryIds: [], serviceKinds: [] },
    quota: { total: null, perPeriod: null, period: null },
    maxPerTransaction: 1,
    usedTotal: 0,
    usedThisPeriod: 0,
    remainingTotal: null,
    remainingThisPeriod: null,
    nextAvailableAt: null,
    periodLabel: null,
    available: true,
    reason: null,
    ...over,
  }) as never;

const quoteOf = (
  benefits: unknown[],
  lines: unknown[] = [],
): BenefitQuoteResponse =>
  ({
    cards: [
      {
        id: CARD,
        number: "MBR-0007",
        petId: "pet-1",
        planName: "Paket VIP",
        status: "active",
        benefits,
      },
    ],
    lines,
  }) as BenefitQuoteResponse;

const candidate = (discount: string, benefitId = "ben-1") => ({
  membershipId: CARD,
  membershipNumber: "MBR-0007",
  planName: "Paket VIP",
  benefitId,
  benefitLabel: "Gratis Grooming Lengkap",
  kind: "free_item",
  discount,
});

const item = (over: Record<string, unknown> = {}) =>
  ({
    kind: "service",
    refId: "svc-1",
    name: "Grooming Lengkap",
    qty: "1.0000",
    unitPrice: "150000.0000",
    lineTotal: "150000.0000",
    discount: null,
    petId: "pet-1",
    petName: "Bruno",
    ...over,
  }) as unknown as PosItem;

describe("benefitRows", () => {
  it("lists a benefit even when nothing in the basket can take it", () => {
    const [row] = benefitRows(quoteOf([benefit()]), [item()]);

    expect(row.label).toBe("Gratis Grooming Lengkap");
    expect(row.target).toBeNull();
    expect(row.blocked).toBe("Tidak ada baris yang cocok di keranjang");
  });

  /* The whole point of the section: an unusable benefit is SHOWN, with why. */
  it("says why a spent benefit cannot be used, in Bahasa", () => {
    const [row] = benefitRows(
      quoteOf([benefit({ available: false, reason: "period_exhausted" })]),
      [item()],
    );

    expect(row.blocked).toBe("Jatah periode ini sudah dipakai");
  });

  it("offers it against the line, naming what it saves", () => {
    const [row] = benefitRows(
      quoteOf([benefit()], [
        { ref: "0", petId: "pet-1", candidates: [candidate("150000.0000")], recommended: null },
      ]),
      [item()],
    );

    expect(row.blocked).toBeNull();
    expect(row.target).toEqual({ index: 0, discount: "150000.0000" });
  });

  /* Not the first line that matches — the one the customer gains most from. */
  it("picks the line it is worth most on", () => {
    const rows = benefitRows(
      quoteOf([benefit()], [
        { ref: "0", petId: "pet-1", candidates: [candidate("80000.0000")], recommended: null },
        { ref: "1", petId: "pet-1", candidates: [candidate("150000.0000")], recommended: null },
      ]),
      [item(), item({ refId: "svc-2", unitPrice: "150000.0000" })],
    );

    expect(rows[0].target?.index).toBe(1);
  });

  it("reports where it is already applied, so the section can offer Lepas", () => {
    const [row] = benefitRows(
      quoteOf([benefit()], [
        { ref: "0", petId: "pet-1", candidates: [candidate("150000.0000")], recommended: null },
      ]),
      [
        item({
          discount: { source: "membership", membershipId: CARD, benefitId: "ben-1" },
        }),
      ],
    );

    expect(row.appliedTo).toBe(0);
    expect(row.blocked).toBeNull();
  });

  /*
    ONE LINE TAKES ONE BENEFIT. A line already paid for by some OTHER benefit is
    not a target for this one — offering it would produce a write the server
    refuses, from a button that looked live.
  */
  it("will not target a line another benefit already paid for", () => {
    const [row] = benefitRows(
      quoteOf([benefit({ id: "ben-2", label: "Potong Kuku" })], [
        { ref: "0", petId: "pet-1", candidates: [candidate("25000.0000", "ben-2")], recommended: null },
      ]),
      [
        item({
          discount: { source: "membership", membershipId: CARD, benefitId: "ben-1" },
        }),
      ],
    );

    expect(row.target).toBeNull();
    expect(row.blocked).toBe("Tidak ada baris yang cocok di keranjang");
  });

  it("survives a quote that arrives without its cards", () => {
    expect(benefitRows({} as BenefitQuoteResponse, [item()])).toEqual([]);
    expect(benefitRows(null, [item()])).toEqual([]);
  });
});
