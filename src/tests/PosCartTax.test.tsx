import { screen } from "@testing-library/react";

import { PosCart } from "@/features/pos/components/PosCart";
import type { PosRunningTotals, PosTransaction } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

/**
 * WHAT THE BASKET SAYS THE CUSTOMER OWES.
 *
 * THE BUG THIS EXISTS FOR made the till unusable and said nothing about why. The
 * total read `runningTotals.net` — what is owed BEFORE tax is separated out.
 * For a shop whose prices already include tax the two are equal, which is why it
 * stood for a year. The moment a shop switched to exclusive pricing, the basket
 * showed Rp 120.000, the payment screen reported "Sisa Rp 0", and the server
 * refused every payment for a Rp 13.200 remainder that appeared on no screen.
 *
 * THE ARITHMETIC HAS TO ADD UP EITHER WAY, and that is the second half: a PPN
 * row drawn for an inclusive shop would make subtotal + tax overshoot the total
 * by the whole tax, and somebody checking the figures would be right to say the
 * screen was wrong.
 */
const totals = (overrides: Partial<PosRunningTotals> = {}): PosRunningTotals => ({
  subtotal: "120000.0000",
  itemDiscount: "0.0000",
  cartDiscount: "0.0000",
  otherCharges: "0.0000",
  net: "120000.0000",
  ...overrides,
});

const cart = (runningTotals: PosRunningTotals) =>
  ({
    _id: "cart-1",
    status: "active",
    customer: null,
    items: [
      {
        kind: "service",
        refId: "svc-1",
        name: "Grooming Full Service",
        sku: "GRM-FULL",
        qty: "1.0000",
        unitPrice: "120000.0000",
        discount: null,
        lineTotal: "120000.0000",
      },
    ],
    otherCharges: [],
    cartDiscount: null,
    note: null,
    runningTotals,
  }) as unknown as PosTransaction;

/**
 * The figure beside the word "Total".
 *
 * NOT `getByText("Rp 120.000")`: that string also appears as the line price and
 * as the subtotal, so a bare lookup matches three nodes and passes for the wrong
 * one. What is being tested here is specifically what the till TOTALS to.
 */
const totalShown = () =>
  screen.getByText("Total").parentElement?.textContent?.replace("Total", "");

const open = (runningTotals: PosRunningTotals) =>
  renderWithAuth(
    <PosCart
      cart={cart(runningTotals)}
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

describe("prices that EXCLUDE tax", () => {
  const exclusive = totals({
    tax: "13200.0000",
    payable: "133200.0000",
    taxRate: 11,
    taxAdded: true,
  });

  it("totals what the customer actually pays, not the pre-tax figure", () => {
    open(exclusive);

    expect(totalShown()).toBe("Rp 133.200");
  });

  it("shows the tax as its own row, so the arithmetic can be followed", () => {
    open(exclusive);

    const row = screen.getByText("PPN 11%").parentElement;
    expect(row?.textContent).toContain("Rp 13.200");
  });

  /* The running total now carries it — the promise is already kept. */
  it("stops promising the tax will be worked out later", () => {
    open(exclusive);

    expect(
      screen.queryByText(/PPN dihitung saat pembayaran/i),
    ).not.toBeInTheDocument();
  });
});

describe("prices that INCLUDE tax", () => {
  const inclusive = totals({
    tax: "11891.8919",
    payable: "120000.0000",
    taxRate: 11,
    taxAdded: false,
  });

  it("totals the same figure it always did", () => {
    open(inclusive);

    expect(totalShown()).toBe("Rp 120.000");
  });

  /*
    NO PPN ROW. The tax is real and reported, but it is already inside every
    price above — a row here would make subtotal + PPN overshoot the total.
  */
  it("draws no tax row, because the tax is already in the prices", () => {
    open(inclusive);

    expect(screen.queryByText("PPN 11%")).not.toBeInTheDocument();
  });
});

/*
  A SERVER THAT SENDS NO TAX AT ALL — an older build, or a path with no tenant
  lookup in front of it. Falling back to `net` is exact for the inclusive default
  and no worse than what this screen did before.
*/
describe("when the server says nothing about tax", () => {
  it("falls back to the pre-tax total rather than rendering nothing", () => {
    open(totals());

    expect(totalShown()).toBe("Rp 120.000");
  });

  it("keeps the old promise, which is still the truth there", () => {
    open(totals());

    expect(
      screen.getByText(/PPN dihitung saat pembayaran/i),
    ).toBeInTheDocument();
  });
});
