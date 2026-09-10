import { render, screen } from "@testing-library/react";

import { StockEntryKindHint } from "@/features/inventory/components/StockEntryKindHint";

/**
 * The note each stock document carries about the other.
 *
 * IT IS COPY, and a test over copy earns its place here for one reason: the two
 * notes are looked up from a map keyed by kind, and swapping the pair is a
 * one-character mistake that turns the safeguard into the trap — a form telling
 * somebody to book their opening balance as a loss, in a confident voice.
 */
describe("StockEntryKindHint", () => {
  it("sends the adjustment form to Stok Awal", () => {
    render(<StockEntryKindHint kind="adjustment" />);

    expect(screen.getByRole("link", { name: /Stok Awal/ })).toHaveAttribute(
      "href",
      "/dashboard/inventory/opening-stock/new",
    );
    // And says what the wrong choice costs, which is the whole point of it.
    expect(screen.getByText(/kerugian persediaan/i)).toBeInTheDocument();
  });

  it("sends the opening-stock form to Penyesuaian", () => {
    render(<StockEntryKindHint kind="opening_balance" />);

    expect(screen.getByRole("link", { name: /Penyesuaian/ })).toHaveAttribute(
      "href",
      "/dashboard/inventory/adjustments/new",
    );
    // This one answers the refusal the picker already enforces rather than
    // warning about a booking the API would reject anyway.
    expect(
      screen.getByText(/belum pernah punya pergerakan di gudang ini/i),
    ).toBeInTheDocument();
  });
});
