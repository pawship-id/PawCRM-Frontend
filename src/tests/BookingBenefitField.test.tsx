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

const field = (props: Partial<Parameters<typeof BookingBenefitField>[0]> = {}) => (
  <BookingBenefitField view={view()} serviceName="Grooming" onPick={jest.fn()} {...props} />
);

describe("BookingBenefitField — the main service's benefit on its price row", () => {
  it("draws a compact select when the quote offers more than one candidate", async () => {
    const onPick = jest.fn();
    render(field({ onPick }));

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    const select = screen.getByRole("combobox", { name: "Member untuk Grooming" });
    expect(select).toHaveTextContent("Jatah Grooming 1/3");
    /* A quota pick holds the jatah — and says so. */
    expect(
      screen.getByText("Jatah ditahan sampai booking dibayar atau dibatalkan."),
    ).toBeInTheDocument();

    await userEvent.click(select);
    /* Names only — the struck price on the row says how much. */
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Jatah Grooming 1/3",
      "Member · Diskon 10%",
      "Tanpa member",
    ]);
    await userEvent.click(screen.getByRole("option", { name: "Member · Diskon 10%" }));
    expect(onPick).toHaveBeenLastCalledWith(diskon);

    await userEvent.click(screen.getByRole("combobox", { name: "Member untuk Grooming" }));
    await userEvent.click(await screen.findByRole("option", { name: "Tanpa member" }));
    expect(onPick).toHaveBeenLastCalledWith(null);
  });

  it("reads 'Tanpa member' and drops the hold note when nothing is selected", () => {
    render(field({ view: view({ selectedKey: null }) }));

    expect(screen.getByRole("combobox", { name: "Member untuk Grooming" })).toHaveTextContent(
      "Tanpa member",
    );
    expect(screen.queryByText(/Jatah ditahan/)).not.toBeInTheDocument();
  });

  it("shows one candidate's name with a Tanpa member / Pakai member toggle", async () => {
    const onPick = jest.fn();
    const { rerender } = render(field({ view: view({ candidates: [jatah] }), onPick }));

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("Jatah Grooming 1/3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tanpa member untuk Grooming" }));
    expect(onPick).toHaveBeenLastCalledWith(null);

    rerender(field({ view: view({ candidates: [jatah], selectedKey: null }), onPick }));
    expect(screen.getByText("Tanpa member")).toBeInTheDocument();
    expect(screen.queryByText(/Jatah ditahan/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Pakai member untuk Grooming" }));
    expect(onPick).toHaveBeenLastCalledWith(jatah);
  });

  it("shows the server's reason, muted, when a covering benefit cannot be used", () => {
    render(
      field({
        view: view({
          candidates: [],
          selectedKey: null,
          emptyMessage: "Jatah Grooming habis periode ini · dipakai BK-2026-0012",
        }),
      }),
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.getByText("Jatah Grooming habis periode ini · dipakai BK-2026-0012"),
    ).toHaveClass("text-muted");
  });

  it("draws nothing when the animal holds no card, or nothing covers the service", () => {
    const { container, rerender } = render(field({ view: view({ show: false }) }));
    expect(container).toBeEmptyDOMElement();

    rerender(field({ view: view({ candidates: [], selectedKey: null, emptyMessage: null }) }));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the server's refusal on the row", () => {
    render(field({ error: "Jatah periode ini sudah habis · dipakai BK-2026-0012" }));
    expect(screen.getByRole("alert")).toHaveTextContent("dipakai BK-2026-0012");
  });

  it("locks the control on a billed booking", () => {
    const { rerender } = render(field({ disabled: true }));
    expect(screen.getByRole("combobox", { name: "Member untuk Grooming" })).toBeDisabled();

    rerender(field({ view: view({ candidates: [jatah] }), disabled: true }));
    expect(screen.getByRole("button", { name: "Tanpa member untuk Grooming" })).toBeDisabled();
  });
});
