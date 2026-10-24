import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OtherBenefitsInfo } from "@/features/booking/components/OtherBenefitsInfo";
import { otherBenefitsOf, toggleExtra } from "@/features/booking/otherBenefits";
import type { MembershipBenefit, PetMembership } from "@/types/membership";

/**
 * "Benefit lain dari {paket}" — the card benefits a booking cannot use:
 * product benefits (used at the till) and perks. Service, add-on and "any"
 * benefits are left out — the price rows offer those.
 */
const benefit = (
  label: string,
  target: "service" | "product" | "addon" | "any" | null,
  over: Partial<MembershipBenefit> = {},
): MembershipBenefit =>
  ({
    id: `ben-${label}`,
    label,
    kind: target ? "discount_percent" : "perk",
    scope: { target: target ?? "any", serviceIds: [], productIds: [], categoryIds: [], serviceKinds: [] },
    value: null,
    quota: { total: null, perPeriod: null, period: null },
    options: target
      ? [
          {
            id: `opt-${label}`,
            kind: "discount_percent",
            scope: { target, serviceIds: [], productIds: [], categoryIds: [], serviceKinds: [] },
          },
        ]
      : [],
    summary: "",
    ...over,
  }) as MembershipBenefit;

const card = (over: Partial<PetMembership>, benefits: MembershipBenefit[]): PetMembership =>
  ({
    id: "mem-1",
    attachTo: "pet",
    petId: "pet-1",
    status: "active",
    plan: { name: "Explorer", benefits },
    ...over,
  }) as PetMembership;

const explorer = card({}, [
  benefit("Grooming", "service", { kind: "free_item", quota: { total: null, perPeriod: 1, period: "month" } }),
  benefit("Add-on", "addon"),
  benefit("Semua", "any"),
  benefit("Makanan", "product", { kind: "free_item", quota: { total: null, perPeriod: 2, period: "month" } }),
  benefit("Prioritas antrean", null),
]);

describe("otherBenefitsOf", () => {
  it("lists product benefits as used at the till and perks as fasilitas", () => {
    expect(otherBenefitsOf([explorer], "pet-1")).toEqual([
      {
        key: "mem-1",
        blocked: null,
        planName: "Explorer",
        lines: [
          {
            membershipId: "mem-1",
            benefitId: "ben-Makanan",
            label: "Makanan",
            text: "Makanan · 2× per bulan — dipakai di kasir",
          },
          {
            membershipId: "mem-1",
            benefitId: "ben-Prioritas antrean",
            label: "Prioritas antrean",
            text: "Prioritas antrean (fasilitas)",
          },
        ],
      },
    ]);
  });

  it("counts a customer-attached card for every animal, and another animal's card for none", () => {
    const shared = card({ id: "mem-2", attachTo: "customer", petId: null, plan: { name: "Keluarga", benefits: [benefit("Pasir", "product")] } as never }, []);
    const groups = otherBenefitsOf([explorer, shared], "pet-2");
    expect(groups).toEqual([
      {
        key: "mem-2",
        blocked: null,
        planName: "Keluarga",
        lines: [
          {
            membershipId: "mem-2",
            benefitId: "ben-Pasir",
            label: "Pasir",
            text: "Pasir · tanpa batas — dipakai di kasir",
          },
        ],
      },
    ]);
  });

  it("returns nothing when every benefit is usable in a booking", () => {
    const servicesOnly = card({}, [benefit("Grooming", "service"), benefit("Add-on", "addon")]);
    expect(otherBenefitsOf([servicesOnly], "pet-1")).toEqual([]);
    expect(otherBenefitsOf([explorer], "")).toEqual([]);
  });
});

describe("OtherBenefitsInfo", () => {
  it("draws one box per card, read-only without onChange", () => {
    render(<OtherBenefitsInfo groups={otherBenefitsOf([explorer], "pet-1")} />);

    expect(screen.getByText("Benefit lain dari Explorer")).toBeInTheDocument();
    expect(screen.getByText("Makanan · 2× per bulan — dipakai di kasir")).toBeInTheDocument();
    expect(screen.getByText("Prioritas antrean (fasilitas)")).toBeInTheDocument();
    expect(screen.queryByText(/Grooming/)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    /* A heading, not a muted caption. */
    expect(screen.getByRole("heading", { name: "Benefit lain dari Explorer" })).toHaveClass(
      "text-sm",
      "font-semibold",
      "text-foreground",
    );
  });

  it("gives every line a checkbox; ticking sends the whole new set", async () => {
    const groups = otherBenefitsOf([explorer], "pet-1");
    const onChange = jest.fn();
    const { rerender } = render(
      <OtherBenefitsInfo groups={groups} selected={[]} onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole("checkbox", { name: "Prioritas antrean (fasilitas)" }));
    expect(onChange).toHaveBeenLastCalledWith([
      { membershipId: "mem-1", benefitId: "ben-Prioritas antrean", label: "Prioritas antrean" },
    ]);

    const both = [
      { membershipId: "mem-1", benefitId: "ben-Prioritas antrean", label: "Prioritas antrean" },
      { membershipId: "mem-1", benefitId: "ben-Makanan", label: "Makanan" },
    ];
    rerender(<OtherBenefitsInfo groups={groups} selected={both} onChange={onChange} />);
    expect(
      screen.getByRole("checkbox", { name: "Makanan · 2× per bulan — dipakai di kasir" }),
    ).toBeChecked();

    await userEvent.click(screen.getByRole("checkbox", { name: "Prioritas antrean (fasilitas)" }));
    expect(onChange).toHaveBeenLastCalledWith([both[1]]);
  });

  it("draws nothing when there is nothing to list", () => {
    const { container } = render(<OtherBenefitsInfo groups={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("toggleExtra", () => {
  const line = { membershipId: "m", benefitId: "b", label: "Perk", text: "Perk (fasilitas)" };

  it("adds once and removes", () => {
    const on = toggleExtra([], line, true);
    expect(on).toEqual([{ membershipId: "m", benefitId: "b", label: "Perk" }]);
    expect(toggleExtra(on, line, true)).toEqual(on);
    expect(toggleExtra(on, line, false)).toEqual([]);
  });
});

describe("a paused or unpaid card (22 October 2026)", () => {
  const { blockedReasonOf } = jest.requireActual("@/features/booking/otherBenefits");

  it("is blocked when a pause covers the booking date, and says until when", () => {
    const card = {
      status: "active",
      pauses: [{ startDate: "2026-10-22T00:00:00+07:00", endDate: "2026-10-29T00:00:00+07:00" }],
    };
    expect(blockedReasonOf(card, "2026-10-25T08:00:00+07:00")).toMatch(
      /^Membership sedang ditunda s\.d\. 28 Okt 2026/,
    );
    // A visit after the pause can use it.
    expect(blockedReasonOf(card, "2026-10-30T08:00:00+07:00")).toBeNull();
  });

  it("is blocked while the card is not paid", () => {
    expect(blockedReasonOf({ status: "awaiting_payment", pauses: [] }, null)).toMatch(/belum lunas/);
  });
});
