import { render, screen } from "@testing-library/react";

import { saleEffects } from "@/features/pos/components/PosSaleEffects";
import { perkChipLabel, PosCustomerPerks } from "@/features/pos/components/PosCustomerPerks";
import type { PosTransaction } from "@/types/api";
import type { PetMembership } from "@/types/membership";

/**
 * What a paid sale set off (Promosi V1), and the customer's perk chips.
 */
const sale = {
  customer: { _id: "c1", name: "Ibu Rina", phone: null },
  items: [
    { kind: "membership", name: "Explorer", petId: "p1", petName: "Milo", membershipId: "card-1", discount: null },
    { kind: "membership", name: "Family", petId: null, petName: null, membershipId: "card-2", discount: null },
    {
      kind: "service",
      name: "Grooming",
      petId: "p1",
      petName: "Milo",
      discount: { source: "membership", benefitLabel: "Grooming" },
    },
    { kind: "service", name: "Biaya kunjungan", petId: null, petName: null, discount: { source: "membership", visitFeeWaiver: true } },
    { kind: "product", name: "Sampo", petId: null, petName: null, discount: null },
  ],
} as unknown as PosTransaction;

const card = (over: Partial<PetMembership>): PetMembership =>
  ({
    id: "card-1",
    number: "MBR-2026-0042",
    attachTo: "pet",
    petId: "p1",
    petName: "Milo",
    status: "active",
    awaitingPayment: false,
    startDate: "2026-10-16T03:00:00.000Z",
    endDate: "2027-04-15T03:00:00.000Z",
    plan: { name: "Explorer" },
    ...over,
  }) as PetMembership;

describe("saleEffects", () => {
  it("lists the cards issued and the jatah spent", () => {
    const cards = new Map([
      ["card-1", card({})],
      ["card-2", card({ id: "card-2", number: "MBR-2026-0043", status: "awaiting_payment", petId: null })],
    ]);

    const texts = saleEffects(sale, cards).map((effect) => effect.text);

    expect(texts[0]).toMatch(/^Membership Explorer untuk Milo aktif .+ · MBR-2026-0042$/);
    expect(texts[1]).toBe(
      "Membership Family untuk Ibu Rina (semua hewan) aktif setelah lunas · MBR-2026-0043",
    );
    expect(texts[2]).toBe("Jatah Grooming terpakai · Milo");
    expect(texts[3]).toBe("Biaya kunjungan gratis dari member");
    expect(texts).toHaveLength(4);
  });

  it("says nothing for a sale without membership", () => {
    expect(
      saleEffects({ ...sale, items: [sale.items[4]] }, new Map()),
    ).toEqual([]);
  });
});

describe("PosCustomerPerks", () => {
  it("names the animal and plan, says ditunda, and the customer-held card", () => {
    expect(perkChipLabel(card({}))).toBe("Milo · Explorer");
    expect(perkChipLabel(card({ status: "paused" }))).toBe("Milo · Explorer · ditunda");
    expect(
      perkChipLabel(card({ attachTo: "customer", petId: null, plan: { name: "Family" } as never })),
    ).toBe("Semua hewan · Family");
  });

  it("shows three chips at most, then +n", () => {
    render(
      <PosCustomerPerks
        cards={[1, 2, 3, 4, 5].map((n) => card({ id: `c${n}`, petName: `Pet ${n}` }))}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });
});
