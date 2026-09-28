import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

/**
 * ─── THE PANEL ITSELF — 28 September 2026, on request ────────────────────────
 *
 * It was cramped in a way that read as a broken form: the heading was the
 * TRIGGER's accessible name, so a product name ran to two lines and shoved the
 * mode buttons down the panel, and the number box carried no unit at all — a
 * bare "5" in a panel that can mean 5 percent or 5 rupiah, which are a
 * thousandfold apart.
 */
const LONG = "Cat Choise Adult — 1kg / Chicken / Orange";

const openPanel = async (value: PosDiscount | null) => {
  render(
    <PosDiscountPopover
      value={value}
      label={`Diskon ${LONG}`}
      subject={LONG}
      onApply={() => {}}
    />,
  );
  await userEvent.click(badge());
  return screen.getByRole("dialog");
};

describe("the panel", () => {
  it("heads itself with one word and leaves the long name to a subtitle", async () => {
    const panel = await openPanel(null);

    /*
      THE HEADING IS A FIXED WORD. `getByText` with an exact string is the
      point of this assertion: the moment the heading goes back to carrying the
      item name, it stops matching.
    */
    expect(within(panel).getByText("Diskon")).toBeVisible();
    // The name is still there — as a subtitle, with the whole of it on hover.
    expect(within(panel).getByText(LONG)).toHaveAttribute("title", LONG);
  });

  it("keeps the long name on the trigger, where a screen reader needs it", async () => {
    await openPanel(null);

    // Twelve buttons all called "Diskon" tell somebody navigating by button
    // exactly nothing about which line they are on.
    expect(badge()).toHaveAccessibleName(`Diskon ${LONG}`);
  });

  it("says which unit the number is in, in both modes", async () => {
    const panel = await openPanel(null);

    expect(within(panel).getByText("%")).toBeVisible();

    await userEvent.click(within(panel).getByRole("button", { name: "Nominal" }));

    expect(within(panel).getByText("Rp")).toBeVisible();
    expect(within(panel).queryByText("%")).not.toBeInTheDocument();
  });

  /*
    A GREYED "Hapus diskon" ON A LINE THAT HAS NONE is a third of the footer
    spent saying nothing, and it made Terapkan read as half of a pair rather
    than as the action of the panel.
  */
  it("offers Hapus only when there is a discount to remove", async () => {
    const panel = await openPanel(null);

    expect(
      within(panel).queryByRole("button", { name: /Hapus diskon/ }),
    ).not.toBeInTheDocument();
  });

  /*
    ─── THE PANEL OPENED ON ITS OWN ERROR ───────────────────────────────────

    A stored discount carries the LEDGER'S SCALE — 5% is "5.0000" — and the
    percent field allows two decimals. So re-opening an existing discount drew
    "Isi persentase 0–100" under a box nobody had touched and greyed out
    Terapkan: adjusting a discount meant clearing the field and retyping it.
  */
  it("opens an existing percentage ready to apply, not ready to complain", async () => {
    const panel = await openPanel(
      discount({ mode: "percent", value: "5.0000", resolvedAmount: "5000.0000" }),
    );

    expect(within(panel).getByRole("textbox", { name: /persen/i })).toHaveValue("5");
    expect(
      within(panel).queryByText(/Isi persentase/),
    ).not.toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Terapkan" }),
    ).toBeEnabled();
  });

  it("opens an existing nominal discount as whole rupiah", async () => {
    const panel = await openPanel(
      discount({ mode: "amount", value: "15000.0000", resolvedAmount: "15000.0000" }),
    );

    // ".0000" would fail WHOLE_RUPIAH, which is what decides whether Terapkan
    // can be pressed at all.
    expect(within(panel).getByRole("textbox", { name: /rupiah/i })).toHaveValue("15000");
    expect(
      within(panel).getByRole("button", { name: "Terapkan" }),
    ).toBeEnabled();
  });

  it("offers Hapus once a discount is on the line", async () => {
    const panel = await openPanel(discount());

    expect(
      within(panel).getByRole("button", { name: /Hapus diskon/ }),
    ).toBeVisible();
  });
});
