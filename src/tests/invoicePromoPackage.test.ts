import { invoicePromoInput } from "@/features/sales/invoicePromo";

/**
 * A package line takes no promo (19 November 2026) — the server's
 * `#applyPromos` skips it, so the preview does not ask about it either.
 */
describe("invoicePromoInput — package lines", () => {
  it("leaves a membership row out of the promo quote", () => {
    const input = invoicePromoInput({
      rows: [
        { key: "a", kind: "membership", refId: "plan-1", qty: "1", unitPrice: "300000", benefit: null },
        { key: "b", kind: "product", refId: "prod-1", qty: "1", unitPrice: "50000", benefit: null },
      ],
      customerId: "cust-1",
      branchId: "branch-1",
      invoiceDate: "2026-11-19",
      memberQuote: null,
    });

    expect(input?.lines.map((line) => line.ref)).toEqual(["b"]);
  });

  it("asks nothing when the only row is a package", () => {
    expect(
      invoicePromoInput({
        rows: [
          { key: "a", kind: "membership", refId: "plan-1", qty: "1", unitPrice: "300000", benefit: null },
        ],
        customerId: "cust-1",
        branchId: "branch-1",
        invoiceDate: "2026-11-19",
        memberQuote: null,
      }),
    ).toBeNull();
  });
});
