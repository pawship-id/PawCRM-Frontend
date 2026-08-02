/**
 * The Purchasing module's contract — suppliers, goods receipts, the payables
 * they create, the payments that clear them, and returns to the supplier.
 *
 * NONE OF THIS EXISTS IN THE BACKEND YET. The types are written against the
 * shape the API will take, following the same three rules the Inventory types
 * already follow: money and quantities are decimal STRINGS, ids are strings, and
 * a document never carries a derived total the server would rather recompute.
 *
 * WHERE IT MEETS INVENTORY. A goods receipt is the first real CALLER of
 * `StockMovementService.postMovements`: receiving goods raises stock, creates a
 * lot for anything that expires, recomputes the weighted average from the price
 * actually paid, and posts to the ledger. Purchasing supplies the DOCUMENT; it
 * does not reimplement the movement.
 */

/**
 * How a tenant works with a supplier.
 *
 *   beli_putus  — bought outright. The goods are the tenant's on arrival, so a
 *                 payable is created and the ledger is posted.
 *   konsinyasi  — consigned. The goods sit in the warehouse but belong to the
 *                 supplier until they sell, so there is NO payable and NO
 *                 journal on receipt — nothing has been bought yet.
 *   both        — the supplier does either, decided per receipt.
 */
export type SupplierType = "beli_putus" | "konsinyasi" | "both";

export interface Supplier {
  _id: string;
  name: string;
  supplierType: SupplierType;
  picName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  npwp: string | null;
  /** Days from invoice date to due date. 0 means payable on receipt. */
  paymentTermDays: number;
  notes: string | null;
  isActive: boolean;
}

/** What kind of arrival this is — the same axis as `SupplierType`, per receipt. */
export type ReceiptType = "beli_putus" | "konsinyasi";

/** One line of a goods receipt. */
export interface GoodsReceiptItem {
  _id: string;
  receiptId: string;
  productId: string;
  /** The lot this line created, when the product tracks batches. */
  batchId: string | null;
  qty: string;
  /** Decimal string — the price actually paid, which drives the new average. */
  costPerUnit: string;
  subtotal: string;
}

export interface GoodsReceipt {
  _id: string;
  receiptNumber: string;
  supplierId: string;
  warehouseId: string;
  receiptDate: string;
  receiptType: ReceiptType;
  /** Σ line subtotals, before tax. */
  totalAmount: string;
  /** PPN. Debited to 1301 rather than folded into inventory cost. */
  taxAmount: string;
  /** Null for a consignment receipt — nothing was bought, so nothing is owed. */
  invoiceId: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

export type InvoiceStatus = "unpaid" | "partial" | "paid";

/**
 * A payable, created automatically by an outright-purchase receipt.
 *
 * `total` is mutable, unlike most totals here: a purchase return reduces what is
 * owed, and the reduction has to land on the invoice or the supplier statement
 * and the ledger stop agreeing.
 */
export interface PurchaseInvoice {
  _id: string;
  invoiceNumber: string;
  supplierId: string;
  goodsReceiptId: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  paidAmount: string;
  status: InvoiceStatus;
}

/** How money left the tenant. Cash and QRIS hit Kas; transfer and giro hit Bank. */
export type PaymentMethod = "transfer" | "cash" | "qris" | "giro";

export interface SupplierPayment {
  _id: string;
  supplierId: string;
  invoiceId: string;
  paymentDate: string;
  amount: string;
  method: PaymentMethod;
  referenceNumber: string | null;
  notes: string | null;
  createdBy: string | null;
}

/** Why goods went back. Free-form would make the reason unreportable. */
export type ReturnReason = "rusak" | "kadaluarsa" | "salah kirim" | "lainnya";

export interface PurchaseReturnItem {
  _id: string;
  returnId: string;
  productId: string;
  batchId: string | null;
  /**
   * The receipt line being reversed.
   *
   * LOAD-BEARING, not bookkeeping decoration: it is what carries the ORIGINAL
   * purchase price. Reversing the weighted average at today's average instead
   * would leave the remaining stock valued at a number nobody ever paid.
   */
  originalReceiptItemId: string;
  qty: string;
  costPerUnit: string;
  subtotal: string;
  reason: ReturnReason;
}

export interface PurchaseReturn {
  _id: string;
  returnNumber: string;
  supplierId: string;
  warehouseId: string;
  originalReceiptId: string;
  returnDate: string;
  totalAmount: string;
  createdBy: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ inputs */

export interface SaveSupplierInput {
  id?: string;
  name: string;
  supplierType: SupplierType;
  picName?: string;
  phone?: string;
  email?: string;
  address?: string;
  npwp?: string;
  paymentTermDays: number;
  notes?: string;
}

export interface ReceiptLineInput {
  productId: string;
  qty: string;
  costPerUnit: string;
  batchCode?: string;
  expiryDate?: string;
}

export interface SubmitReceiptInput {
  supplierId: string;
  warehouseId: string;
  receiptType: ReceiptType;
  receiptDate: string;
  invoiceNumber?: string;
  taxAmount?: string;
  notes?: string;
  items: ReceiptLineInput[];
}

export interface SubmitPaymentInput {
  invoiceId: string;
  amount: string;
  method: PaymentMethod;
  paymentDate: string;
  referenceNumber?: string;
  notes?: string;
}

export interface SubmitPurchaseReturnInput {
  originalReceiptId: string;
  returnDate: string;
  items: Array<{
    originalReceiptItemId: string;
    qty: string;
    reason: ReturnReason;
  }>;
}

/**
 * The reverse-weighted-average preview a return form shows before submitting.
 *
 * Returning goods is the one operation that can make the remaining stock MORE
 * expensive: if what went back was cheaper than the running average, the average
 * of what stays behind rises. Surfacing the arithmetic is what stops that
 * looking like a bug when somebody notices HPP moved after a return.
 */
export interface ReverseHppPreview {
  productName: string;
  qtyBefore: string;
  hppBefore: string | null;
  qtyReturned: string;
  originalCost: string;
  qtyAfter: string;
  /** Null when the return empties the stock — there is nothing left to value. */
  hppAfter: string | null;
  /** Consignment lots keep the supplier's cost; the average is not touched. */
  skipped: boolean;
}
