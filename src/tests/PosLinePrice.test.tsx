import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosCart } from "@/features/pos/components/PosCart";
import type { PosItem, PosTransaction } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

/**
 * TYPING A PRICE OVER THE CATALOGUE'S — 28 September 2026, on the owner's
 * request.
 *
 * WHAT THIS SUITE IS REALLY GUARDING is that the override stays a GRANT. The
 * server refuses a typed price without `posTransactions:setPrice`, because
 * otherwise an override is a way round FR-4's 10% discount limit — a cashier
 * refused 20% off could type the discounted figure instead. A box drawn for a
 * cashier the server will refuse is a control that exists to fail, so the two
 * sides have to agree, and only a test says they still do.
 */
const line = (overrides: Partial<PosItem> = {}): PosItem =>
  ({
    kind: "product",
    refId: "prod-1",
    name: "Royal Canin Adult 2kg",
    sku: "RC-ADULT-2KG",
    qty: "2.0000",
    unitPrice: "100000.0000",
    listPrice: null,
    discount: null,
    lineTotal: "200000.0000",
    ...overrides,
  }) as PosItem;

const cart = (item: PosItem) =>
  ({
    _id: "cart-1",
    status: "active",
    customer: null,
    items: [item],
    otherCharges: [],
    cartDiscount: null,
    note: null,
    runningTotals: {
      subtotal: "200000.0000",
      itemDiscount: "0.0000",
      cartDiscount: "0.0000",
      otherCharges: "0.0000",
      net: "200000.0000",
    },
  }) as unknown as PosTransaction;

const SET_PRICE = [
  { feature: "posTransactions" as const, actions: ["create", "read", "setPrice"] },
];
const NO_SET_PRICE = [
  { feature: "posTransactions" as const, actions: ["create", "read"] },
];

function open(
  item: PosItem,
  permissions: typeof SET_PRICE,
  onLinePrice = jest.fn(),
) {
  renderWithAuth(
    <PosCart
      cart={cart(item)}
      busy={false}
      error={null}
      onQtyChange={jest.fn()}
      onRemove={jest.fn()}
      onItemDetails={jest.fn()}
      onLinePrice={onLinePrice}
      onCartDiscount={jest.fn()}
      onCharges={jest.fn()}
      onHold={jest.fn()}
      onCheckout={jest.fn()}
      onNote={jest.fn()}
      onPickCustomer={jest.fn()}
      onClearCustomer={jest.fn()}
    />,
    { isSuperAdmin: false, permissions },
  );
  return onLinePrice;
}

describe("typing a price over the catalogue's", () => {
  it("offers no way in to a cashier without the grant", () => {
    open(line(), NO_SET_PRICE);

    // The figure is still there — it is the AFFORDANCE that is withheld.
    expect(screen.getByText("Rp 100.000")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Ubah harga/ }),
    ).not.toBeInTheDocument();
  });

  it("sends what was typed, on Enter", async () => {
    const onLinePrice = open(line(), SET_PRICE);

    await userEvent.click(
      screen.getByRole("button", { name: /Ubah harga Royal Canin/ }),
    );
    const box = screen.getByRole("spinbutton", {
      name: /Harga Royal Canin/,
    });
    await userEvent.clear(box);
    await userEvent.type(box, "80000{Enter}");

    expect(onLinePrice).toHaveBeenCalledWith(0, "80000");
  });

  it("writes nothing when the typed price is the one already there", async () => {
    const onLinePrice = open(line(), SET_PRICE);

    await userEvent.click(
      screen.getByRole("button", { name: /Ubah harga Royal Canin/ }),
    );
    await userEvent.type(
      screen.getByRole("spinbutton", { name: /Harga Royal Canin/ }),
      "{Enter}",
    );

    /*
      The whole cart round-trips on every send, so a no-op write would flicker
      the basket and cost a request for nothing.
    */
    expect(onLinePrice).not.toHaveBeenCalled();
  });

  it("abandons the edit on Escape", async () => {
    const onLinePrice = open(line(), SET_PRICE);

    await userEvent.click(
      screen.getByRole("button", { name: /Ubah harga Royal Canin/ }),
    );
    const box = screen.getByRole("spinbutton", { name: /Harga Royal Canin/ });
    await userEvent.clear(box);
    await userEvent.type(box, "1{Escape}");

    expect(onLinePrice).not.toHaveBeenCalled();
  });

  /*
    AN EMPTIED BOX IS "PUT IT BACK", not "make it free". Free is typing a zero,
    which is a thing somebody has to mean — and `null` is what makes the server
    re-read the catalogue, so the line gets TODAY's shelf price rather than a
    figure frozen whenever it was overridden.
  */
  it("clears the override when the box is emptied", async () => {
    const onLinePrice = open(
      line({ unitPrice: "80000.0000", listPrice: "100000.0000" }),
      SET_PRICE,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Ubah harga Royal Canin/ }),
    );
    const box = screen.getByRole("spinbutton", { name: /Harga Royal Canin/ });
    await userEvent.clear(box);
    await userEvent.type(box, "{Enter}");

    expect(onLinePrice).toHaveBeenCalledWith(0, null);
  });

  it("shows what the tile said beside what is being charged", () => {
    open(line({ unitPrice: "80000.0000", listPrice: "100000.0000" }), SET_PRICE);

    expect(screen.getByText("Rp 80.000")).toBeVisible();
    /*
      THE WORD CARRIES IT, not the strike-through alone: struck-through pricing
      is a convention about a SALE the shop is advertising, and this is the
      opposite — a figure somebody chose to type. §1.3's rule, in its own way.
    */
    expect(screen.getByText("Rp 100.000")).toBeVisible();
    expect(screen.getByText("Harga diubah")).toBeVisible();
  });

  it("says nothing about a list price on an ordinary line", () => {
    open(line(), SET_PRICE);

    expect(screen.queryByText("Harga diubah")).not.toBeInTheDocument();
  });
});
