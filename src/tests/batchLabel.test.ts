import {
  labelPayload,
  parseLabelPayload,
  searchableCode,
} from "@/lib/batchLabel";

/**
 * What a batch label's QR carries (18 Oct 2026). The server reads the same
 * format — PawCRM-Backend `utils/labelPayload.js` — so a change here that the
 * server does not share is a label the till cannot read.
 */
const LOT = {
  sku: "RC-KITTEN-2KG",
  barcode: "8991234567890",
  batchCode: "B2610-0042",
  supplierBatchCode: "LOT77812",
  expiryDate: "2027-01-31T00:00:00.000Z",
};

describe("labelPayload", () => {
  it("carries SKU, barcode and both lot codes when the lot has an expiry", () => {
    expect(labelPayload(LOT)).toBe(
      [
        "BULOO",
        "SKU:RC-KITTEN-2KG",
        "BC:8991234567890",
        "BATCH:B2610-0042",
        "SPL:LOT77812",
        "EXP:2027-01-31",
      ].join("\n"),
    );
  });

  it("leaves the lot codes off a lot with no expiry", () => {
    expect(labelPayload({ ...LOT, expiryDate: null })).toBe(
      "BULOO\nSKU:RC-KITTEN-2KG\nBC:8991234567890",
    );
  });

  it("skips a barcode the product does not have", () => {
    expect(labelPayload({ ...LOT, barcode: null })).not.toContain("BC:");
  });

  it("skips a supplier code the lot does not have", () => {
    expect(labelPayload({ ...LOT, supplierBatchCode: null })).not.toContain(
      "SPL:",
    );
  });

  it("falls back to the lot code when nothing else would name it", () => {
    expect(
      labelPayload({
        sku: null,
        barcode: null,
        batchCode: "B2610-0042",
        supplierBatchCode: null,
        expiryDate: null,
      }),
    ).toBe("BULOO\nBATCH:B2610-0042");
  });
});

describe("parseLabelPayload", () => {
  it("reads back what labelPayload wrote", () => {
    expect(parseLabelPayload(labelPayload(LOT))).toEqual({
      sku: "RC-KITTEN-2KG",
      barcode: "8991234567890",
      batch: "B2610-0042",
      supplierBatch: "LOT77812",
      expiry: "2027-01-31",
    });
  });

  it("reads it when a scanner typed it with the newlines dropped", () => {
    expect(parseLabelPayload(labelPayload(LOT).replace(/\n/g, ""))?.batch).toBe(
      "B2610-0042",
    );
  });

  it("is null for anything that is not one of our labels", () => {
    expect(parseLabelPayload("8991234567890")).toBeNull();
  });
});

describe("searchableCode", () => {
  it("puts the SKU in the search box for a label", () => {
    expect(searchableCode(labelPayload(LOT))).toBe("RC-KITTEN-2KG");
  });

  it("keeps a plain code as it is", () => {
    expect(searchableCode(" 8991234567890 ")).toBe("8991234567890");
  });
});
