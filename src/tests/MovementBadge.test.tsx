import { render, screen } from "@testing-library/react";

import { MovementBadge } from "@/features/inventory/components/MovementBadge";
import type { MovementType } from "@/types/inventory";

/**
 * Every movement type a stock card can meet.
 *
 * THE BUG THIS SUITE EXISTS FOR white-screened `/dashboard/inventory/stock-card`.
 * `invoice_sale` shipped on the server while the union here still listed ten
 * types — so TypeScript was satisfied, `LABELS[type]` returned `undefined`, and
 * destructuring it threw. One unfamiliar row took down the whole page, including
 * the ten rows this build understood.
 *
 * The backend's `MOVEMENT_TYPES` and the frontend's `MovementType` are two lists
 * and NOTHING checks that they agree. That gap is still open; what closed the
 * crash is that an unknown type now degrades to a neutral badge instead of
 * throwing.
 */
const KNOWN: MovementType[] = [
  "receipt",
  "pos_sale",
  "invoice_sale",
  "invoice_void",
  "pos_void",
  "opname_diff",
  "purchase_return",
  "customer_return",
  "transfer_in",
  "transfer_out",
  "bundle_consume",
  "adjustment",
  "opening_balance",
];

describe("every known type renders a word", () => {
  it.each(KNOWN)("%s", (type) => {
    render(<MovementBadge type={type} />);

    // Never colour alone — ui-rules §1.3. Every badge carries a label, and it is
    // never the raw enum for a type this build knows.
    const badge = screen.getByText(/\S/);
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).not.toBe(type);
  });

  /*
    NAMED APART FROM `pos_sale`, not folded into it. A stock card answers "where
    did this go", and one shop sells across a counter while billing a kennel
    monthly — collapsing the two would make "how much went out over the counter"
    unanswerable.
  */
  it("distinguishes an invoice from a till sale", () => {
    const { unmount } = render(<MovementBadge type="pos_sale" />);
    const till = screen.getByText(/\S/).textContent;
    unmount();

    render(<MovementBadge type="invoice_sale" />);
    expect(screen.getByText(/\S/).textContent).not.toBe(till);
  });
});

/*
  A ROW IS A FACT THAT ALREADY HAPPENED. Refusing to draw the card because one
  row is unfamiliar loses every row that is not.
*/
describe("a type this build has never heard of", () => {
  it("renders instead of throwing", () => {
    expect(() =>
      render(<MovementBadge type={"some_future_type" as MovementType} />),
    ).not.toThrow();
  });

  it("shows the raw value, which is legible enough to act on", () => {
    render(<MovementBadge type={"some_future_type" as MovementType} />);

    expect(screen.getByText("some_future_type")).toBeInTheDocument();
  });
});
