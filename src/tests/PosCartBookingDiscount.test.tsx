import { screen } from "@testing-library/react";

import { PosCart } from "@/features/pos/components/PosCart";
import type { PosTransaction } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

/**
 * "DISKON BOOKING" IN THE BASKET — shown apart from the lines' own discounts,
 * the way the grooming board's Rincian shows it (15 September 2026).
 *
 * Cici's Basic Grooming carries 7.170 off: 5.000 of its own and 2.170 of the
 * booking's share of "Diskon seluruh booking". Its Extra Handling carries 377,
 * all of it share. The server keeps each line's `discount` whole and says in
 * `bookingDiscount` which part is the share; the till shows the own part on the
 * line and the share once, under the booking.
 */
const cart = () =>
  ({
    _id: "cart-1",
    status: "active",
    customer: null,
    items: [
      {
        kind: "service",
        refId: "svc-groom",
        name: "Basic Grooming",
        sku: null,
        qty: "1.0000",
        unitPrice: "120000.0000",
        lineTotal: "120000.0000",
        discount: {
          mode: "amount",
          value: "7170.0000",
          resolvedAmount: "7170.0000",
          approvedBy: null,
        },
        bookingDiscount: "2170.0000",
        bookingId: "bk-3",
        bookingNumber: "BK-260915-003",
        parentServiceId: null,
        petId: "pet-cici",
        petName: "Cici",
      },
      {
        kind: "service",
        refId: "svc-extra",
        name: "Extra Handling",
        sku: null,
        qty: "1.0000",
        unitPrice: "20000.0000",
        lineTotal: "20000.0000",
        discount: {
          mode: "amount",
          value: "377.0000",
          resolvedAmount: "377.0000",
          approvedBy: null,
        },
        bookingDiscount: "377.0000",
        bookingId: "bk-3",
        bookingNumber: "BK-260915-003",
        parentServiceId: "svc-groom",
        petId: "pet-cici",
        petName: "Cici",
      },
    ],
    otherCharges: [],
    cartDiscount: null,
    note: null,
    runningTotals: {
      subtotal: "140000.0000",
      itemDiscount: "7547.0000",
      cartDiscount: "0.0000",
      otherCharges: "0.0000",
      net: "132453.0000",
    },
  }) as unknown as PosTransaction;

const open = () =>
  renderWithAuth(
    <PosCart
      cart={cart()}
      busy={false}
      error={null}
      onQtyChange={jest.fn()}
      onRemove={jest.fn()}
      onItemDetails={jest.fn()}
      onLinePrice={jest.fn()}
      onCartDiscount={jest.fn()}
      onCharges={jest.fn()}
      onHold={jest.fn()}
      onCheckout={jest.fn()}
      onNote={jest.fn()}
      onPickCustomer={jest.fn()}
      onClearCustomer={jest.fn()}
    />,
  );

describe("PosCart — Diskon booking", () => {
  it("shows only the line's own discount on the line", () => {
    open();

    /* On the line (a <span>) — the totals' "Diskon item" shows the same 5.000 in a <dd>. */
    expect(
      screen.getAllByText("−Rp 5.000").some((node) => node.tagName === "SPAN"),
    ).toBe(true);
    /* Neither the whole figure nor the add-on's share appears on a line. */
    expect(screen.queryByText("−Rp 7.170")).not.toBeInTheDocument();
    expect(screen.queryByText("−Rp 377")).not.toBeInTheDocument();
  });

  it("shows the booking's share once, in the totals under Diskon item — not under each booking", () => {
    open();

    const rows = screen.getAllByText("Diskon booking");

    expect(rows).toHaveLength(1);
    expect(rows[0].tagName).toBe("DT");
    expect(rows[0].parentElement?.textContent).toContain("Rp 2.547");

    expect(screen.getByText("Diskon item").parentElement?.textContent).toContain(
      "Rp 5.000",
    );
  });
});

/**
 * "DISKON MEMBERSHIP" — a card's own line, apart from "Diskon item"
 * (1 October 2026, on request).
 *
 * It used to be folded into "Diskon item" — one figure answering two different
 * questions, "how much did we choose to give away" and "how much had the
 * customer already paid for". A card's part now gets its own line, with which
 * lines it paid for underneath; "Diskon item" is cashier-typed discounts only.
 */
const cartWithBenefit = () =>
  ({
    _id: "cart-2",
    status: "active",
    customer: null,
    items: [
      {
        kind: "service",
        refId: "svc-groom",
        name: "Full Grooming - In Store",
        sku: null,
        qty: "1.0000",
        unitPrice: "169000.0000",
        lineTotal: "169000.0000",
        discount: {
          mode: "amount",
          value: "169000.0000",
          resolvedAmount: "169000.0000",
          approvedBy: null,
          source: "membership",
          membershipId: "mem-1",
          benefitId: "ben-1",
          benefitLabel: "Gratis Grooming Lengkap",
        },
        membershipDiscount: "169000.0000",
        bookingDiscount: null,
        bookingId: null,
        parentServiceId: null,
        petId: "pet-bruno",
        petName: "Bruno",
      },
      {
        kind: "product",
        refId: "prod-shampoo",
        name: "Sampo Kutu",
        sku: null,
        qty: "1.0000",
        unitPrice: "50000.0000",
        lineTotal: "50000.0000",
        discount: {
          mode: "amount",
          value: "5000.0000",
          resolvedAmount: "5000.0000",
          approvedBy: null,
        },
        membershipDiscount: null,
        bookingDiscount: null,
        bookingId: null,
        parentServiceId: null,
        petId: null,
        petName: null,
      },
    ],
    otherCharges: [],
    cartDiscount: null,
    note: null,
    runningTotals: {
      subtotal: "219000.0000",
      itemDiscount: "174000.0000",
      cartDiscount: "0.0000",
      otherCharges: "0.0000",
      net: "45000.0000",
    },
  }) as unknown as PosTransaction;

const openWithBenefit = () =>
  renderWithAuth(
    <PosCart
      cart={cartWithBenefit()}
      busy={false}
      error={null}
      onQtyChange={jest.fn()}
      onRemove={jest.fn()}
      onItemDetails={jest.fn()}
      onLinePrice={jest.fn()}
      onCartDiscount={jest.fn()}
      onCharges={jest.fn()}
      onHold={jest.fn()}
      onCheckout={jest.fn()}
      onNote={jest.fn()}
      onPickCustomer={jest.fn()}
      onClearCustomer={jest.fn()}
    />,
  );

describe("PosCart — Diskon membership", () => {
  it("keeps a card's giveaway out of Diskon item, in its own line", () => {
    openWithBenefit();

    /* Only the cashier's own 5.000 off the shampoo — the card's 169.000 is not
       counted in here at all. */
    expect(screen.getByText("Diskon item").parentElement?.textContent).toContain(
      "Rp 5.000",
    );
    expect(
      screen.getByText("Diskon membership").parentElement?.textContent,
    ).toContain("Rp 169.000");
  });

  it("lists which line the card paid for, under the total", () => {
    openWithBenefit();

    /* It also names the line as the cart line's own title does — appears
       twice, once on the row and once in this list. */
    expect(
      screen.getAllByText("Bruno - Full Grooming - In Store"),
    ).toHaveLength(2);
    /* The shampoo was the cashier's own discount, not the card's — it stays off
       the "Diskon membership" list, even though it is still in the basket. */
    const membershipList = screen
      .getByText("Diskon membership")
      .closest("div")?.nextElementSibling;
    expect(membershipList?.textContent).not.toContain("Sampo Kutu");
  });

  /* No membership on the basket at all: the line does not appear as "Rp 0". */
  it("says nothing when no line was paid by a card", () => {
    open();

    expect(screen.queryByText("Diskon membership")).not.toBeInTheDocument();
  });
});

/**
 * "DISKON KERANJANG" WHEN THE BASKET IS ALREADY AT NOUGHT (1 October 2026, on
 * request) — the same rule item lines already follow: a basket the server
 * would floor at zero anyway gets no control pretending it can be cut further.
 */
const cartAtNought = (cartDiscount: PosTransaction["cartDiscount"] = null) =>
  ({
    _id: "cart-3",
    status: "active",
    customer: null,
    items: [
      {
        kind: "service",
        refId: "svc-groom",
        name: "Full Grooming - In Store",
        sku: null,
        qty: "1.0000",
        unitPrice: "169000.0000",
        lineTotal: "169000.0000",
        discount: {
          mode: "amount",
          value: "169000.0000",
          resolvedAmount: "169000.0000",
          approvedBy: null,
          source: "membership",
          membershipId: "mem-1",
          benefitId: "ben-1",
          benefitLabel: "Gratis Grooming Lengkap",
        },
        membershipDiscount: "169000.0000",
        bookingDiscount: null,
        bookingId: null,
        parentServiceId: null,
        petId: "pet-bruno",
        petName: "Bruno",
      },
    ],
    otherCharges: [],
    cartDiscount,
    note: null,
    runningTotals: {
      subtotal: "169000.0000",
      itemDiscount: "169000.0000",
      cartDiscount: cartDiscount ? "0.0000" : "0.0000",
      otherCharges: "0.0000",
      net: "0.0000",
      payable: "0.0000",
    },
  }) as unknown as PosTransaction;

const openAtNought = (cartDiscount: PosTransaction["cartDiscount"] = null) =>
  renderWithAuth(
    <PosCart
      cart={cartAtNought(cartDiscount)}
      busy={false}
      error={null}
      onQtyChange={jest.fn()}
      onRemove={jest.fn()}
      onItemDetails={jest.fn()}
      onLinePrice={jest.fn()}
      onCartDiscount={jest.fn()}
      onCharges={jest.fn()}
      onHold={jest.fn()}
      onCheckout={jest.fn()}
      onNote={jest.fn()}
      onPickCustomer={jest.fn()}
      onClearCustomer={jest.fn()}
    />,
  );

describe("PosCart — Diskon keranjang at nought", () => {
  it("disables it once the basket has nothing left to take off", () => {
    openAtNought();

    expect(
      screen.getByRole("button", { name: "Diskon keranjang" }),
    ).toBeDisabled();
  });

  /*
    ONLY WHEN NOTHING WAS TYPED. A basket at nought BECAUSE the cashier typed
    100% off must keep its control, or the discount they just entered is one
    they can never take back off.
  */
  it("keeps it enabled when the nought is the cart discount's own doing", () => {
    openAtNought({
      mode: "percent",
      value: "100",
      resolvedAmount: "169000.0000",
      approvedBy: null,
    });

    expect(
      screen.getByRole("button", { name: "Diskon keranjang" }),
    ).toBeEnabled();
  });
});
