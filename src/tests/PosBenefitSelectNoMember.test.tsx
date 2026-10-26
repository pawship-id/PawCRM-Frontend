import { render, screen } from "@testing-library/react";

import { PosBenefitSelect } from "@/features/pos/components/PosBenefitSelect";
import type { PosItem } from "@/types/api";
import type { BenefitCandidate, BenefitQuoteLineResult } from "@/types/membership";

/**
 * A BOOKING ADD-ON AGREED "TANPA MEMBER" (22 October 2026) — pulled into the
 * basket at its normal price, its select on "Tanpa member" and saying it is
 * "sesuai booking"; the benefit is still offered in the select.
 */
const addon = (overrides: Partial<PosItem> = {}) =>
  ({
    kind: "service",
    refId: "svc-parfum",
    name: "Parfum",
    qty: "1.0000",
    unitPrice: "20000.0000",
    lineTotal: "20000.0000",
    discount: null,
    bookingId: "bk-1",
    parentServiceId: "svc-groom",
    petId: "pet-1",
    fromBooking: true,
    plannedNoBenefit: true,
    ...overrides,
  }) as PosItem;

const diskon = {
  membershipId: "mem-1",
  benefitId: "ben-addon",
  optionId: "opt-1",
  label: "Member · Diskon 10%",
  discount: "2000.0000",
  kind: "unlimited",
} as BenefitCandidate;

const quoteLine = {
  ref: "1",
  candidates: [diskon],
  recommended: null,
  plannedNoBenefit: true,
} as unknown as BenefitQuoteLineResult;

describe("PosBenefitSelect — booking add-on agreed Tanpa member", () => {
  it("starts on Tanpa member and says it is as booked", () => {
    render(<PosBenefitSelect item={addon()} line={quoteLine} onChange={() => {}} />);

    expect(screen.getByRole("combobox", { name: "Member untuk Parfum" })).toHaveTextContent(
      "Tanpa member",
    );
    expect(screen.getByText("sesuai booking")).toBeInTheDocument();
  });

  it("stops saying so once the cashier picks the benefit anyway", () => {
    render(
      <PosBenefitSelect
        item={addon({ benefit: { membershipId: "mem-1", benefitId: "ben-addon", optionId: "opt-1" } })}
        line={{ ...quoteLine, recommended: diskon }}
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Member untuk Parfum" })).toHaveTextContent(
      "Member · Diskon 10%",
    );
    expect(screen.queryByText("sesuai booking")).not.toBeInTheDocument();
  });
});
