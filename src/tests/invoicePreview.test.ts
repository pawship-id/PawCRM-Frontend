import { previewInvoice } from "@/features/sales/invoicePreview";

/**
 * The browser-side preview of what an invoice will come to.
 *
 * WHY IT IS TESTED AS HARD AS THE SERVER'S. This mirrors
 * `utils/invoicePricing.js`, and two implementations of one rule can drift. The
 * failure would not look like a bug: the form would show one number, the issued
 * invoice would carry another, and the difference would surface as a customer
 * saying "this isn't what you quoted me".
 *
 * The numbers below are the SAME cases the server's suite asserts, so a drift in
 * either direction shows up as a failure here rather than on somebody's bill.
 */
describe("subtotal and line totals", () => {
  it("multiplies quantity by price", () => {
    const preview = previewInvoice([{ qty: "3", unitPrice: "25000" }]);

    expect(preview.subtotal).toBe("75000.0000");
    expect(preview.grandTotal).toBe("75000.0000");
  });

  it("carries a fractional quantity without drifting", () => {
    // `Number` arithmetic is what this module exists to avoid — 2.5 × 19999
    // must be exact, not 49997.499999999996.
    const preview = previewInvoice([{ qty: "2.5", unitPrice: "19999" }]);

    expect(preview.subtotal).toBe("49997.5000");
  });

  it("adds every line", () => {
    const preview = previewInvoice([
      { qty: "1", unitPrice: "900000" },
      { qty: "1", unitPrice: "100000" },
    ]);

    expect(preview.subtotal).toBe("1000000.0000");
  });
});

describe("discounts, in the order the server applies them", () => {
  it("takes a percentage off a line", () => {
    const preview = previewInvoice([
      {
        qty: "1",
        unitPrice: "100000",
        discount: { mode: "percent", value: "10" },
      },
    ]);

    expect(preview.itemDiscount).toBe("10000.0000");
    expect(preview.grandTotal).toBe("90000.0000");
  });

  /*
    THE INVOICE DISCOUNT IS MEASURED AFTER THE LINE ONES, which changes the
    answer: 10% of the Rp 900.000 left after a Rp 100.000 line discount is
    Rp 90.000, not the Rp 100.000 that 10% of the gross would give.
  */
  it("measures the invoice discount against what the line discounts left", () => {
    const preview = previewInvoice(
      [
        {
          qty: "1",
          unitPrice: "1000000",
          discount: { mode: "amount", value: "100000" },
        },
      ],
      { mode: "percent", value: "10" },
    );

    expect(preview.itemDiscount).toBe("100000.0000");
    expect(preview.invoiceDiscount).toBe("90000.0000");
    expect(preview.grandTotal).toBe("810000.0000");
  });

  it("caps a nominal discount at its line", () => {
    // Rp 50.000 off a Rp 40.000 line takes Rp 40.000 — never more, or the line
    // would pay the customer.
    const preview = previewInvoice([
      {
        qty: "1",
        unitPrice: "40000",
        discount: { mode: "amount", value: "50000" },
      },
    ]);

    expect(preview.itemDiscount).toBe("40000.0000");
    expect(preview.grandTotal).toBe("0.0000");
  });

  it("rounds a fractional percentage half-up, like the server", () => {
    const preview = previewInvoice([
      {
        qty: "1",
        unitPrice: "1",
        discount: { mode: "percent", value: "33.335" },
      },
    ]);

    // 3333,5 minor units rounds to 3334; truncation would give 3333, and that
    // half-rupiah per line is how a screen and an invoice drift apart.
    expect(preview.lineDiscounts[0]).toBe("0.3334");
  });
});

/*
  A HALF-TYPED FORM IS NOT AN ERROR. This runs on every keystroke, so a field
  mid-edit has to produce a harmless number rather than throw — the SERVER is
  where a bad value is refused.
*/
describe("a form still being typed", () => {
  it("treats an empty quantity as nothing", () => {
    expect(previewInvoice([{ qty: "", unitPrice: "10000" }]).subtotal).toBe(
      "0.0000",
    );
  });

  it("ignores an unparseable price rather than throwing", () => {
    expect(() =>
      previewInvoice([{ qty: "1", unitPrice: "seratus" }]),
    ).not.toThrow();
  });

  it("clamps a percentage above 100 instead of going negative", () => {
    const preview = previewInvoice([
      {
        qty: "1",
        unitPrice: "50000",
        discount: { mode: "percent", value: "150" },
      },
    ]);

    expect(preview.grandTotal).toBe("0.0000");
  });

  it("ignores a negative discount", () => {
    const preview = previewInvoice([
      {
        qty: "1",
        unitPrice: "50000",
        discount: { mode: "amount", value: "-100" },
      },
    ]);

    expect(preview.grandTotal).toBe("50000.0000");
  });

  it("answers an empty invoice with zeroes", () => {
    expect(previewInvoice([]).grandTotal).toBe("0.0000");
  });
});

/**
 * WHETHER PRICES INCLUDE TAX CHANGES WHAT THE TOTAL MEANS.
 *
 * Inclusive is the Indonesian shelf-price norm and the server's default. Getting
 * this branch wrong understates a bill by the whole tax — 11% of every invoice.
 */
describe("tax-inclusive versus tax-exclusive pricing", () => {
  it("adds nothing when the price already includes tax", () => {
    const preview = previewInvoice([{ qty: "1", unitPrice: "111000" }], null, {
      priceIncludesTax: true,
      taxRate: 11,
    });

    expect(preview.grandTotal).toBe("111000.0000");
  });

  it("adds the tax on top when prices exclude it", () => {
    const preview = previewInvoice([{ qty: "1", unitPrice: "100000" }], null, {
      priceIncludesTax: false,
      taxRate: 11,
    });

    expect(preview.grandTotal).toBe("111000.0000");
  });

  /*
    `taxAdded` EXISTS SO THE RECAP ADDS UP. The screen listed Subtotal
    Rp 100.000 → Total Rp 111.000 with nothing between them, and a caption
    underneath was the only clue where the difference came from.
  */
  it("reports the tax it added, so the recap can show it", () => {
    const preview = previewInvoice([{ qty: "1", unitPrice: "100000" }], null, {
      priceIncludesTax: false,
      taxRate: 11,
    });

    expect(preview.taxAdded).toBe("11000.0000");
  });

  /*
    ZERO ON INCLUSIVE PRICING — and that is NOT "no tax was charged". The tax is
    already inside the subtotal; the server unwinds it at posting. A recap row
    reading "PPN Rp 0" here would deny a tax that was collected.
  */
  it("adds nothing when the price already contains the tax", () => {
    const preview = previewInvoice([{ qty: "1", unitPrice: "111000" }], null, {
      priceIncludesTax: true,
      taxRate: 11,
    });

    expect(preview.taxAdded).toBe("0.0000");
    expect(preview.grandTotal).toBe("111000.0000");
  });

  it("charges the added tax on what is left after the discounts", () => {
    const preview = previewInvoice(
      [{ qty: "1", unitPrice: "100000" }],
      { mode: "percent", value: "10" },
      { priceIncludesTax: false, taxRate: 11 },
    );

    // 10% off 100.000 leaves 90.000; 11% of that is 9.900.
    expect(preview.taxAdded).toBe("9900.0000");
    expect(preview.grandTotal).toBe("99900.0000");
  });

  it("charges tax on what is left after the discounts, not on the gross", () => {
    const preview = previewInvoice(
      [{ qty: "1", unitPrice: "100000" }],
      { mode: "percent", value: "10" },
      { priceIncludesTax: false, taxRate: 11 },
    );

    expect(preview.grandTotal).toBe("99900.0000");
  });
});

/**
 * EACH LINE'S SLICE OF THE TAX — the form's Pajak column.
 *
 * The server taxes the WHOLE document and allocates the tax back down by each
 * line's net after both discounts; these are that rule's cases, so the column
 * reads what the saved invoice will freeze per line.
 */
describe("the tax on each line", () => {
  it("unwinds the tax inside an inclusive price", () => {
    const preview = previewInvoice([{ qty: "1", unitPrice: "111000" }], null, {
      priceIncludesTax: true,
      taxRate: 11,
    });

    expect(preview.lineTaxes).toEqual(["11000.0000"]);
  });

  /*
    BY NET VALUE AFTER BOTH DISCOUNTS. A 10% invoice discount leaves 810.000 and
    90.000; 11% of the 900.000 left is 99.000, split 89.100 / 9.900.
  */
  it("allocates the document's added tax by what each line is worth", () => {
    const preview = previewInvoice(
      [
        { qty: "1", unitPrice: "900000" },
        { qty: "1", unitPrice: "100000" },
      ],
      { mode: "percent", value: "10" },
      { priceIncludesTax: false, taxRate: 11 },
    );

    expect(preview.lineTaxes).toEqual(["89100.0000", "9900.0000"]);
    expect(preview.taxAdded).toBe("99000.0000");
  });

  /*
    LARGEST REMAINDER, like the server: three equal lines and a tax that does not
    divide by three hand the two leftover minor units to the earliest lines, and
    the parts still sum to exactly the whole.
  */
  it("keeps the parts summing to the document's tax", () => {
    const preview = previewInvoice(
      [
        { qty: "1", unitPrice: "33333.3333" },
        { qty: "1", unitPrice: "33333.3333" },
        { qty: "1", unitPrice: "33333.3333" },
      ],
      null,
      { priceIncludesTax: false, taxRate: 11 },
    );

    expect(preview.taxAdded).toBe("11000.0000");
    expect(preview.lineTaxes).toEqual(["3666.6667", "3666.6667", "3666.6666"]);
  });

  /*
    INCLUSIVE, WITH BOTH KINDS OF DISCOUNT — the branch where the gross and the
    discounts are unwound separately, and the likeliest to drift by a minor unit.
    The figures are what the server's `priceInvoice` returns for these inputs.
  */
  it("matches the server on inclusive prices after both discounts", () => {
    const preview = previewInvoice(
      [
        {
          qty: "2",
          unitPrice: "150000",
          discount: { mode: "percent", value: "7.5" },
        },
        {
          qty: "1",
          unitPrice: "45000",
          discount: { mode: "amount", value: "5000" },
        },
      ],
      { mode: "percent", value: "10" },
      { priceIncludesTax: true, taxRate: 11 },
    );

    expect(preview.lineTaxes).toEqual(["24750.0000", "3567.5676"]);
  });

  it("is zero on every line when the tenant charges no tax", () => {
    const preview = previewInvoice([{ qty: "2", unitPrice: "50000" }]);

    expect(preview.lineTaxes).toEqual(["0.0000"]);
  });
});
