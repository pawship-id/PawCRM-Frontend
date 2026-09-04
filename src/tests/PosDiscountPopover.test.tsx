import { render, screen } from "@testing-library/react";

import { PosDiscountPopover } from "@/features/pos/components/PosDiscountPopover";
import type { PosDiscount } from "@/types/api";

/**
 * The badge on the discount button, and what it is allowed to say.
 *
 * THE BUG THIS SUITE EXISTS FOR. The badge rendered the raw Decimal128 the
 * document stores AND rendered the value the cashier TYPED. Both were wrong at
 * once: a Rp 110.000 discount on a Rp 100.000 line showed "Rp110000.0000" beside
 * a line reading "−Rp 100.000" — the same discount, two different numbers, and
 * the bigger one on the badge that catches the eye.
 */
const discount = (overrides: Partial<PosDiscount> = {}): PosDiscount => ({
  mode: "amount",
  value: "110000.0000",
  resolvedAmount: "100000.0000",
  approvedBy: null,
  ...overrides,
});

const badge = () => screen.getByRole("button", { name: /diskon/i });

describe("what the badge says", () => {
  /*
    THE APPLIED AMOUNT, NOT THE TYPED ONE. A nominal discount larger than the
    line is capped — Rp 50.000 off a Rp 40.000 line is an ordinary mistype, and
    the line pays nothing back. The badge has to agree with the line it sits
    under.
  */
  it("shows what was taken off, not what was typed", () => {
    render(<PosDiscountPopover
        value={discount()}
        label="Diskon Produk ABC"
        onApply={() => {}}
      />);

    expect(badge()).toHaveTextContent("Rp 100.000");
    expect(badge()).not.toHaveTextContent("110");
  });

  it("formats the amount rather than printing the stored decimal", () => {
    render(<PosDiscountPopover
        value={discount()}
        label="Diskon Produk ABC"
        onApply={() => {}}
      />);

    // Not "Rp100000.0000" — the ledger's scale is storage, not something a
    // cashier reads at the till.
    expect(badge()).not.toHaveTextContent("0000");
  });

  /*
    A PERCENTAGE STAYS A PERCENTAGE. "10%" is what was agreed with the customer
    and what the cashier checks their work against; the rupiah it came to is
    already on the line above.
  */
  it("shows a percentage as a percentage", () => {
    render(
      <PosDiscountPopover
        value={discount({ mode: "percent", value: "10.0000", resolvedAmount: "10000.0000" })}
        label="Diskon Produk ABC"
        onApply={() => {}}
      />,
    );

    expect(badge()).toHaveTextContent("10%");
  });

  it("keeps a fractional percentage, with a comma", () => {
    render(
      <PosDiscountPopover
        value={discount({ mode: "percent", value: "7.5000", resolvedAmount: "7500.0000" })}
        label="Diskon Produk ABC"
        onApply={() => {}}
      />,
    );

    expect(badge()).toHaveTextContent("7,5%");
  });

  /*
    100% IS A REAL DISCOUNT — a giveaway, a replacement for a spoiled bag. The
    first trim written for this stripped trailing zeros without caring whether
    they were fractional, which turned "100.0000" into "1".
  */
  it("does not eat the zeros of a whole hundred", () => {
    render(
      <PosDiscountPopover
        value={discount({ mode: "percent", value: "100.0000", resolvedAmount: "40000.0000" })}
        label="Diskon Produk ABC"
        onApply={() => {}}
      />,
    );

    expect(badge()).toHaveTextContent("100%");
    expect(badge()).not.toHaveTextContent("1%");
  });

  it("says nothing when there is no discount", () => {
    render(<PosDiscountPopover
        value={null}
        label="Diskon Produk ABC"
        onApply={() => {}}
      />);

    expect(badge()).toHaveTextContent(/^$/);
  });
});
