import * as demo from "@/features/inventory/data/demoStore";
import { toMinor } from "@/utils/decimal";

/**
 * Purchasing's engine, asserted against the rules the backend will have to
 * honour once it exists.
 *
 * The four that are counter-intuitive enough to regress unnoticed:
 *   - a receipt DELEGATES to the stock gateway rather than reimplementing it,
 *     so it creates lots and moves the average through the same path an
 *     adjustment does;
 *   - consignment raises stock but creates NO payable and NO journal;
 *   - a return reverses at the ORIGINAL purchase price, not today's average —
 *     which can make the remaining stock more expensive, not less;
 *   - a return reduces the invoice, so the supplier statement and the ledger
 *     stay in agreement.
 */
beforeEach(() => {
  demo.resetState();
});

const SPS = "sup_sps";
const ANUGERAH = "sup_anugerah";
const SHAMPOO = "prd_shampoo";
const WSK = "prd_wsk";
const PASIR = "prd_pasir";
const UTAMA = "wh_utama";
const TODAY = "2026-08-02";

function receiveShampoo(qty: string, cost: string) {
  return demo.submitReceipt({
    supplierId: SPS,
    warehouseId: UTAMA,
    receiptType: "beli_putus",
    receiptDate: TODAY,
    items: [{ productId: SHAMPOO, qty, costPerUnit: cost }],
  });
}

describe("goods receipt", () => {
  it("raises stock through the same gateway an adjustment uses", () => {
    const before = toMinor(demo.qtyOnHand(SHAMPOO, UTAMA))!;

    receiveShampoo("10", "50000");

    expect(toMinor(demo.qtyOnHand(SHAMPOO, UTAMA))).toBe(before + toMinor("10")!);
  });

  it("records the movement as a RECEIPT, not an adjustment", () => {
    const receipt = receiveShampoo("5", "50000");

    const movement = demo.movementsFor(SHAMPOO, UTAMA)[0];
    expect(movement.movementType).toBe("receipt");
    // The stock card has to say where the goods came from, or the document is
    // invisible from the ledger side.
    expect(movement.reference).toEqual({
      type: "goods_receipt",
      id: receipt._id,
    });
  });

  it("moves the weighted average toward the price actually paid", () => {
    // Shampoo starts at 44,000 with 13 on hand. 10 more at 50,000 →
    // (13×44,000 + 10×50,000) ÷ 23 = 46,608.6957 → 46,608.6957
    receiveShampoo("10", "50000");

    const product = demo.getState().products.find((p) => p._id === SHAMPOO)!;
    expect(product.hppAvg).toBe("46608.6957");
  });

  it("compounds two lines of the same product within one receipt", () => {
    demo.submitReceipt({
      supplierId: SPS,
      warehouseId: UTAMA,
      receiptType: "beli_putus",
      receiptDate: TODAY,
      items: [
        { productId: PASIR, qty: "10", costPerUnit: "50000" },
        { productId: PASIR, qty: "10", costPerUnit: "70000" },
      ],
    });

    // Pasir had no cost basis: 10@50,000 sets it, then 10@70,000 averages to
    // 60,000. Computing the second against the STORED value would give 70,000.
    const product = demo.getState().products.find((p) => p._id === PASIR)!;
    expect(product.hppAvg).toBe("60000.0000");
  });

  it("creates a lot for a product that tracks expiry", () => {
    const before = demo.batchesAt(WSK, UTAMA).length;

    demo.submitReceipt({
      supplierId: SPS,
      warehouseId: UTAMA,
      receiptType: "beli_putus",
      receiptDate: TODAY,
      items: [
        {
          productId: WSK,
          qty: "24",
          costPerUnit: "32000",
          supplierBatchCode: "WSK-B26-0801",
          expiryDate: "2027-03-31",
        },
      ],
    });

    const batches = demo.batchesAt(WSK, UTAMA);
    expect(batches).toHaveLength(before + 1);
    // THEIRS is what a receipt supplies; ours is minted by the store, so the
    // assertion is about the code that travelled, not the one that was made.
    expect(
      batches.some((b) => b.supplierBatchCode === "WSK-B26-0801"),
    ).toBe(true);
  });

  it("creates a payable with a due date from the supplier's terms", () => {
    // PT Sumber Pakan Sejahtera is on 30-day terms.
    const receipt = receiveShampoo("4", "50000");

    const invoice = demo
      .getState()
      .invoices.find((i) => i._id === receipt.invoiceId)!;
    expect(invoice).toBeDefined();
    expect(invoice.dueDate).toBe("2026-09-01");
    expect(invoice.status).toBe("unpaid");
  });

  it("adds PPN to the payable without inflating inventory cost", () => {
    const receipt = demo.submitReceipt({
      supplierId: SPS,
      warehouseId: UTAMA,
      receiptType: "beli_putus",
      receiptDate: TODAY,
      taxAmount: "50000",
      items: [{ productId: SHAMPOO, qty: "10", costPerUnit: "50000" }],
    });

    const invoice = demo.getState().invoices.find((i) => i._id === receipt.invoiceId)!;
    expect(invoice.subtotal).toBe("500000.0000");
    expect(invoice.total).toBe("550000.0000");

    // PPN is reclaimable, so it goes to 1301 rather than into what the goods
    // cost — otherwise every margin computed from HPP would be understated.
    const journal = demo.previewReceiptJournal("500000", "50000", false);
    expect(journal.map((line) => line.accountCode)).toEqual(["1201", "1301", "2101"]);
  });
});

describe("consignment receipt", () => {
  function receiveConsigned() {
    return demo.submitReceipt({
      supplierId: ANUGERAH,
      warehouseId: UTAMA,
      receiptType: "konsinyasi",
      receiptDate: TODAY,
      items: [
        {
          productId: PASIR,
          qty: "12",
          costPerUnit: "58000",
          supplierBatchCode: "PDG-K01",
        },
      ],
    });
  }

  it("raises stock — the goods are physically there and sellable", () => {
    receiveConsigned();

    expect(demo.qtyOnHand(PASIR, UTAMA)).toBe("12.0000");
  });

  it("creates NO payable, because nothing has been bought yet", () => {
    const receipt = receiveConsigned();

    expect(receipt.invoiceId).toBeNull();
    expect(demo.getState().invoices).toHaveLength(0);
  });

  it("posts NO journal", () => {
    expect(demo.previewReceiptJournal("696000", "0", true)).toEqual([]);
  });

  it("creates a lot carrying the hand-entered cost", () => {
    receiveConsigned();

    const batch = demo.batchesAt(PASIR, UTAMA)[0];
    expect(batch.isConsignment).toBe(true);
    expect(batch.costPerUnit).toBe("58000.0000");
  });
});

describe("supplier payment", () => {
  it("clears an invoice in one go", () => {
    const receipt = receiveShampoo("10", "50000");
    const invoice = demo.getState().invoices.find((i) => i._id === receipt.invoiceId)!;

    demo.submitPayment({
      invoiceId: invoice._id,
      amount: invoice.total,
      method: "transfer",
      paymentDate: TODAY,
    });

    const after = demo.getState().invoices.find((i) => i._id === invoice._id)!;
    expect(after.status).toBe("paid");
    expect(demo.outstandingOf(after)).toBe("0.0000");
  });

  it("supports paying in instalments", () => {
    const receipt = receiveShampoo("10", "50000");
    const invoice = demo.getState().invoices.find((i) => i._id === receipt.invoiceId)!;

    demo.submitPayment({
      invoiceId: invoice._id,
      amount: "200000",
      method: "cash",
      paymentDate: TODAY,
    });

    const after = demo.getState().invoices.find((i) => i._id === invoice._id)!;
    expect(after.status).toBe("partial");
    expect(demo.outstandingOf(after)).toBe("300000.0000");
  });

  it("refuses to pay more than is outstanding", () => {
    const receipt = receiveShampoo("10", "50000");
    const invoice = demo.getState().invoices.find((i) => i._id === receipt.invoiceId)!;

    expect(() =>
      demo.submitPayment({
        invoiceId: invoice._id,
        amount: "999999",
        method: "transfer",
        paymentDate: TODAY,
      }),
    ).toThrow(/melebihi/i);
  });

  it("credits Kas for cash and QRIS, Bank for transfer and giro", () => {
    expect(demo.cashAccountFor("cash").code).toBe("1101");
    expect(demo.cashAccountFor("qris").code).toBe("1101");
    expect(demo.cashAccountFor("transfer").code).toBe("1102");
    expect(demo.cashAccountFor("giro").code).toBe("1102");
  });

  it("debits the payable and credits the cash account", () => {
    const journal = demo.previewPaymentJournal("300000", "transfer");

    expect(journal[0]).toMatchObject({ accountCode: "2101", debit: "300000.0000" });
    expect(journal[1]).toMatchObject({ accountCode: "1102", credit: "300000.0000" });
  });
});

describe("purchase return — reverse weighted average", () => {
  it("reverses at the ORIGINAL price, returning to within a rounding step", () => {
    /**
     * 13 on hand at 44,000. Receive 10 at 50,000:
     *   (13×44,000 + 10×50,000) ÷ 23 = 46,608.695652… → STORED as 46,608.6957
     *
     * Return all ten at the price paid:
     *   (23 × 46,608.6957 − 10 × 50,000) ÷ 13 = 44,000.0001
     *
     * NOT exactly 44,000 — and that is inherent, not a defect. The average was
     * rounded to four places when it was stored, and reversing amplifies that
     * residue by 23/13. Any perpetual weighted average at fixed precision
     * behaves this way; the alternative is keeping unbounded precision on a
     * number that is written on every receipt.
     *
     * What matters is that the residue is BOUNDED at a rounding step rather
     * than accumulating, which is what this asserts.
     */
    const receipt = receiveShampoo("10", "50000");
    const line = demo.receiptItemsOf(receipt._id)[0];

    demo.submitPurchaseReturn({
      originalReceiptId: receipt._id,
      returnDate: TODAY,
      items: [{ originalReceiptItemId: line._id, qty: "10", reason: "rusak" }],
    });

    const product = demo.getState().products.find((p) => p._id === SHAMPOO)!;
    const drift = toMinor(product.hppAvg!)! - toMinor("44000")!;

    expect(drift <= 1n && drift >= -1n).toBe(true);
  });

  it("RAISES the average when the returned goods were cheaper than it", () => {
    // The counter-intuitive case, and the reason the form shows the arithmetic:
    // 13 at 44,000 plus 10 at 20,000 averages to 33,565.2174. Sending the cheap
    // ten back leaves only the expensive thirteen — so the average climbs.
    const receipt = receiveShampoo("10", "20000");
    const line = demo.receiptItemsOf(receipt._id)[0];

    const before = demo.getState().products.find((p) => p._id === SHAMPOO)!.hppAvg!;

    demo.submitPurchaseReturn({
      originalReceiptId: receipt._id,
      returnDate: TODAY,
      items: [{ originalReceiptItemId: line._id, qty: "10", reason: "rusak" }],
    });

    const after = demo.getState().products.find((p) => p._id === SHAMPOO)!.hppAvg!;
    expect(toMinor(after)!).toBeGreaterThan(toMinor(before)!);
    expect(after).toBe("44000.0000");
  });

  it("takes the stock back out", () => {
    const receipt = receiveShampoo("10", "50000");
    const line = demo.receiptItemsOf(receipt._id)[0];
    const before = toMinor(demo.qtyOnHand(SHAMPOO, UTAMA))!;

    demo.submitPurchaseReturn({
      originalReceiptId: receipt._id,
      returnDate: TODAY,
      items: [{ originalReceiptItemId: line._id, qty: "4", reason: "rusak" }],
    });

    expect(toMinor(demo.qtyOnHand(SHAMPOO, UTAMA))).toBe(before - toMinor("4")!);
    expect(demo.movementsFor(SHAMPOO, UTAMA)[0].movementType).toBe("purchase_return");
  });

  it("reduces the payable so the statement and the ledger agree", () => {
    const receipt = receiveShampoo("10", "50000");
    const line = demo.receiptItemsOf(receipt._id)[0];

    demo.submitPurchaseReturn({
      originalReceiptId: receipt._id,
      returnDate: TODAY,
      items: [{ originalReceiptItemId: line._id, qty: "4", reason: "rusak" }],
    });

    const invoice = demo.getState().invoices.find((i) => i._id === receipt.invoiceId)!;
    // 500,000 received, 200,000 sent back.
    expect(invoice.total).toBe("300000.0000");
  });

  it("caps the return at what has not already gone back", () => {
    const receipt = receiveShampoo("10", "50000");
    const line = demo.receiptItemsOf(receipt._id)[0];

    demo.submitPurchaseReturn({
      originalReceiptId: receipt._id,
      returnDate: TODAY,
      items: [{ originalReceiptItemId: line._id, qty: "6", reason: "rusak" }],
    });

    expect(demo.returnedQtyOf(line._id)).toBe("6.0000");
    expect(() =>
      demo.submitPurchaseReturn({
        originalReceiptId: receipt._id,
        returnDate: TODAY,
        items: [{ originalReceiptItemId: line._id, qty: "6", reason: "rusak" }],
      }),
    ).toThrow(/melebihi/i);
  });

  it("leaves the average alone for a consignment lot", () => {
    const receipt = demo.submitReceipt({
      supplierId: ANUGERAH,
      warehouseId: UTAMA,
      receiptType: "konsinyasi",
      receiptDate: TODAY,
      items: [
        {
          productId: PASIR,
          qty: "10",
          costPerUnit: "58000",
          supplierBatchCode: "K-01",
        },
      ],
    });
    const line = demo.receiptItemsOf(receipt._id)[0];
    const before = demo.getState().products.find((p) => p._id === PASIR)!.hppAvg;

    const preview = demo.previewReverseHpp(PASIR, "4", line.costPerUnit, true);
    expect(preview!.skipped).toBe(true);
    expect(preview!.hppAfter).toBe(before);
  });

  it("debits the payable and credits inventory", () => {
    const journal = demo.previewReturnJournal("200000");

    expect(journal[0]).toMatchObject({ accountCode: "2101", debit: "200000.0000" });
    expect(journal[1]).toMatchObject({ accountCode: "1201", credit: "200000.0000" });
  });
});

describe("supplier guards", () => {
  it("refuses to delete a supplier that has delivered", () => {
    receiveShampoo("2", "50000");

    const result = demo.deleteSupplier(SPS);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/penerimaan/i);
  });

  it("deletes one that never has", () => {
    const created = demo.saveSupplier({
      name: "CV Belum Pernah Kirim",
      supplierType: "beli_putus",
      paymentTermDays: 14,
    });

    expect(demo.deleteSupplier(created._id).ok).toBe(true);
  });

  it("sums what is still owed across a supplier's invoices", () => {
    receiveShampoo("10", "50000");
    receiveShampoo("4", "50000");

    // 500,000 + 200,000, nothing paid.
    expect(demo.supplierOutstanding(SPS)).toBe("700000.0000");
  });
});
