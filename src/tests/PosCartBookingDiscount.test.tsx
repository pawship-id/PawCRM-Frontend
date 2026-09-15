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
      onItemDiscount={jest.fn()}
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
