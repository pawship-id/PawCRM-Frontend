import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { CardBenefitView } from "@/features/booking/benefitQuote";
import { BookingBenefitField } from "@/features/booking/components/BookingBenefitField";
import type { BenefitCandidate } from "@/types/membership";

const jatah = {
  membershipId: "mem-1",
  benefitId: "ben-groom",
  optionId: "opt-free",
  benefitLabel: "Grooming",
  planName: "Explorer",
  kind: "quota",
  label: "Jatah Grooming 1/3",
  discount: "100000.0000",
  visitFee: "free",
  visitFeeDiscount: "40000.0000",
} as BenefitCandidate;

const diskon = {
  membershipId: "mem-1",
  benefitId: "ben-disc",
  optionId: "opt-disc",
  benefitLabel: "Diskon",
  planName: "Explorer",
  kind: "unlimited",
  label: "Member · Diskon 10%",
  discount: "10000.0000",
  visitFee: "zone",
  visitFeeDiscount: "0.0000",
} as BenefitCandidate;

const view = (over: Partial<CardBenefitView> = {}): CardBenefitView => ({
  show: true,
  candidates: [jatah, diskon],
  selectedKey: "mem-1|ben-groom",
  emptyMessage: null,
  discount: "100000.0000",
  appliedLabel: "Jatah Grooming 1/3",
  feeWaived: true,
  ...over,
});

describe("BookingBenefitField", () => {
  it("draws one radio per candidate plus 'Tanpa member', with source and discount", () => {
    render(<BookingBenefitField view={view()} onPick={jest.fn()} />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);

    const first = screen.getByRole("radio", { name: /Jatah Grooming 1\/3/ });
    expect(first).toHaveAttribute("aria-checked", "true");
    expect(first).toHaveTextContent("Grooming · Explorer");
    /* The visit fee it waives counts in what it is worth. */
    expect(first).toHaveTextContent("−Rp 140.000");

    expect(screen.getByRole("radio", { name: /Tanpa member/ })).toHaveTextContent("Harga normal");
    /* A quota pick holds the jatah — and says so. */
    expect(
      screen.getByText("Jatah ditahan sampai booking dibayar atau dibatalkan."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Baru dicatat/)).not.toBeInTheDocument();
  });

  it("hands back the candidate picked, and null for 'Tanpa member'", async () => {
    const onPick = jest.fn();
    render(<BookingBenefitField view={view()} onPick={onPick} />);

    await userEvent.click(screen.getByRole("radio", { name: /Member · Diskon 10%/ }));
    expect(onPick).toHaveBeenLastCalledWith(diskon);

    await userEvent.click(screen.getByRole("radio", { name: /Tanpa member/ }));
    expect(onPick).toHaveBeenLastCalledWith(null);
  });

  it("checks 'Tanpa member' and drops the hold note when nothing is selected", () => {
    render(<BookingBenefitField view={view({ selectedKey: null })} onPick={jest.fn()} />);

    expect(screen.getByRole("radio", { name: /Tanpa member/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.queryByText(/Jatah ditahan/)).not.toBeInTheDocument();
  });

  it("shows the server's reason in a muted box when nothing can be offered", () => {
    render(
      <BookingBenefitField
        view={view({
          candidates: [],
          selectedKey: null,
          emptyMessage: "Jatah Grooming habis periode ini · dipakai BK-2026-0012",
        })}
        onPick={jest.fn()}
      />,
    );

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(
      screen.getByText("Jatah Grooming habis periode ini · dipakai BK-2026-0012"),
    ).toBeInTheDocument();
  });

  it("draws nothing when the animal holds no card", () => {
    const { container } = render(
      <BookingBenefitField view={view({ show: false })} onPick={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the server's refusal under the field", () => {
    render(
      <BookingBenefitField
        view={view()}
        error="Jatah periode ini sudah dipesan booking lain · dipakai BK-2026-0012"
        onPick={jest.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("dipakai BK-2026-0012");
  });

  it("locks the rows on a billed booking", () => {
    render(<BookingBenefitField view={view()} disabled onPick={jest.fn()} />);
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  });
});
