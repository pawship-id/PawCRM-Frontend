import { invoiceBenefitRows } from "@/features/sales/components/InvoiceBenefitSection";
import type { Pet } from "@/types/api";
import type { BenefitQuoteResponse } from "@/types/membership";

/**
 * What the faktur's Benefit membership section offers, and what it refuses —
 * the invoice's twin of `posBenefitRows.test.ts`.
 */
const CARD = "card-1";
const PET: Pet = { _id: "pet-1", name: "Bruno" } as Pet;

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

const quoteOf = (benefits: unknown[], lines: unknown[] = []): BenefitQuoteResponse =>
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

const line = (over: Record<string, unknown> = {}) => ({
  key: "row-1",
  petId: "pet-1",
  benefit: null,
  ...over,
});

describe("invoiceBenefitRows", () => {
  it("lists a benefit even when no row in the faktur can take it", () => {
    const [row] = invoiceBenefitRows(quoteOf([benefit()]), [line()], [PET]);

    expect(row.label).toBe("Gratis Grooming Lengkap");
    expect(row.target).toBeNull();
    expect(row.blocked).toBe("Tidak ada baris yang cocok di faktur");
  });

  it("says why a spent benefit cannot be used, in Bahasa", () => {
    const [row] = invoiceBenefitRows(
      quoteOf([benefit({ available: false, reason: "quota_exhausted" })]),
      [line()],
      [PET],
    );

    expect(row.blocked).toBe("Jatah sudah habis");
  });

  it("offers it against the row, naming what it saves and the animal", () => {
    const [row] = invoiceBenefitRows(
      quoteOf([benefit()], [
        { ref: "row-1", petId: "pet-1", candidates: [candidate("150000.0000")], recommended: null },
      ]),
      [line()],
      [PET],
    );

    expect(row.blocked).toBeNull();
    expect(row.target).toEqual({ key: "row-1", candidate: candidate("150000.0000") });
    expect(row.petName).toBe("Bruno");
  });

  /* Not the first row that matches — the one worth most to the customer. */
  it("picks the row it is worth most on", () => {
    const rows = invoiceBenefitRows(
      quoteOf([benefit()], [
        { ref: "row-1", petId: "pet-1", candidates: [candidate("80000.0000")], recommended: null },
        { ref: "row-2", petId: "pet-1", candidates: [candidate("150000.0000")], recommended: null },
      ]),
      [line({ key: "row-1" }), line({ key: "row-2" })],
      [PET],
    );

    expect(rows[0].target?.key).toBe("row-2");
  });

  it("reports where it is already applied, so the section can offer Lepas", () => {
    const [row] = invoiceBenefitRows(
      quoteOf([benefit()], [
        { ref: "row-1", petId: "pet-1", candidates: [candidate("150000.0000")], recommended: null },
      ]),
      [line({ benefit: { membershipId: CARD, benefitId: "ben-1", amount: "150000.0000" } })],
      [PET],
    );

    expect(row.appliedTo).toBe("row-1");
    expect(row.blocked).toBeNull();
  });

  /*
    ONE ROW TAKES ONE BENEFIT. A row already paid for by some OTHER benefit is
    not a target for this one — offering it would be a button that looks live
    and a write the server refuses.
  */
  it("will not target a row another benefit already paid for", () => {
    const [row] = invoiceBenefitRows(
      quoteOf([benefit({ id: "ben-2", label: "Potong Kuku" })], [
        { ref: "row-1", petId: "pet-1", candidates: [candidate("25000.0000", "ben-2")], recommended: null },
      ]),
      [line({ benefit: { membershipId: CARD, benefitId: "ben-1", amount: "150000.0000" } })],
      [PET],
    );

    expect(row.target).toBeNull();
    expect(row.blocked).toBe("Tidak ada baris yang cocok di faktur");
  });

  it("survives a quote that arrives without its cards", () => {
    expect(invoiceBenefitRows({} as BenefitQuoteResponse, [line()], [PET])).toEqual([]);
    expect(invoiceBenefitRows(null, [line()], [PET])).toEqual([]);
  });
});
