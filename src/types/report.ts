import type { AccountType, JournalSourceType } from "./accounting";
/**
 * The reports contract — `/api/reports`.
 *
 * Quantities and money are decimal STRINGS in both directions, like everywhere
 * else here. Nothing in this file parses them; `utils/decimal.ts` does the
 * arithmetic when a screen needs it.
 */

/** One product's stock at one warehouse. */
export interface StockOnHandRow {
  productId: string;
  sku: string | null;
  name: string;
  productType: string;
  unit: string;
  minStock: number;

  categoryId: string | null;
  /** Null when the category was deleted out from under the product. */
  categoryName: string | null;

  warehouseId: string | null;
  warehouseName: string | null;

  /**
   * BOTH NULLABLE, and legitimately so.
   *
   * A warehouse belongs to a branch by soft default (PCR-019), so one set up for
   * a bazaar genuinely belongs to none. The screen groups those under "Tanpa
   * cabang" rather than hiding them — stock nobody visits is exactly the stock a
   * valuation exists to surface.
   */
  branchId: string | null;
  branchName: string | null;

  qty: string;
  /**
   * NULL means no cost basis yet — the product has never been received — and it
   * is NOT the same as zero. Rendering it "Rp 0" would turn "we do not know what
   * this is worth" into "this is worth nothing", and only the first is a
   * data-entry problem the owner should chase.
   */
  hppAvg: string | null;
  /** `qty × hppAvg`, computed server-side. Null whenever `hppAvg` is. */
  value: string | null;

  /** At or below the restock threshold. False when the threshold is zero. */
  isLow: boolean;
}

/**
 * Totals for the WHOLE filtered set, not for the page on screen.
 *
 * `productCount` counts distinct products rather than rows: one product in three
 * warehouses is three rows and one thing to reorder.
 */
export interface StockOnHandTotals {
  qty: string;
  value: string;
  productCount: number;
}

export interface StockOnHandQuery {
  page?: number;
  limit?: number;
  warehouseId?: string;
  /** Matches warehouses whose DEFAULT branch this is — see `branchId` above. */
  branchId?: string;
  /** Sets of either — sent as repeated params. */
  warehouseIds?: string[];
  branchIds?: string[];
  categoryId?: string;
  /** Keep rows whose quantity is zero. Excluded by default. */
  includeZero?: boolean;
}

export interface StockOnHandResult {
  items: StockOnHandRow[];
  totals: StockOnHandTotals;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * GET /api/reports/product-movement — what is selling and what is not, for the
 * Inventori Ringkasan tab.
 *
 * TWO LISTS FROM ONE CALL, because the second is defined by the first: a slow
 * mover is a product in stock that does NOT appear in the sold set, so asking
 * separately would let a sale made between the two calls put a product on both.
 *
 * TWO WINDOWS. `days` ranks the sellers and is fixed at 30 on screen — a ranking
 * is only comparable against itself — while `idleDays` is the reader's own
 * choice, because "nothing in 30 days" and "nothing in 90" are different
 * questions about different products.
 *
 * UNITS ARE NET OF VOIDS, read off `stockmovements` rather than off invoices and
 * till baskets: every sale writes a movement, and the movement carries the
 * warehouse this screen filters by.
 */
export interface ProductMovementReport {
  asOf: string;
  days: number;
  idleDays: number;
  /** Most units first. `qtyOnHand` is what is left on the shelves in scope. */
  topSellers: Array<{
    productId: string;
    sku: string | null;
    name: string;
    unitsSold: string;
    qtyOnHand: string;
  }>;
  /** Most stock first — the biggest pile nobody is buying is worth acting on first. */
  idle: Array<{
    productId: string;
    sku: string | null;
    name: string;
    qtyOnHand: string;
  }>;
}

/**
 * GET /reports/sales-invoices — Laporan › Penjualan per invoice. One row per
 * invoice; money is a decimal string, dates are calendar days in the tenant's
 * timezone.
 *
 * The breakdown fields (`subtotal` … `tax`) are NULL on a till-born invoice,
 * which stored only its total — empty in the file, never a guessed zero.
 */
export interface SalesInvoiceReportRow {
  invoiceNumber: string;
  invoiceDate: string | null;
  dueDate: string | null;
  branchName: string | null;
  warehouseName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  source: "manual" | "pos_bridge";
  channel: "manual" | "marketplace";
  lineCount: number;
  qtyTotal: string | null;
  subtotal: string | null;
  itemDiscount: string | null;
  invoiceDiscount: string | null;
  otherCharges: string | null;
  dpp: string | null;
  tax: string | null;
  taxRate: number | null;
  total: string;
  paidAmount: string;
  outstandingAmount: string;
  status: "unpaid" | "partial" | "paid" | "void";
  isOverdue: boolean;
  createdByName: string | null;
  notes: string | null;
  voidReason: string | null;
}

export interface SalesInvoiceReportQuery {
  /** `yyyy-mm-dd`, both required and inclusive; at most 366 days apart. */
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
  warehouseIds?: string[];
  /** Omitted = every status but `void`. */
  statuses?: SalesInvoiceReportRow["status"][];
}

export interface SalesInvoiceReport {
  range: { fromDate: string | null; toDate: string | null } | null;
  rows: SalesInvoiceReportRow[];
}

/**
 * GET /reports/sales-items — Laporan › Penjualan per produk & layanan. One row
 * per catalogue row sold in the period, largest `net` first. Money and qty are
 * decimal strings; `share` is a percent of the period's net, two places.
 */
export interface SalesItemReportRow {
  kind: "product" | "service" | "membership";
  refId: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  categoryName: string | null;
  invoiceCount: number;
  lineCount: number;
  qty: string;
  gross: string;
  discount: string;
  net: string;
  averagePrice: string | null;
  share: number | null;
}

export interface SalesItemReport {
  range: { fromDate: string | null; toDate: string | null } | null;
  rows: SalesItemReportRow[];
}

export interface SalesItemReportQuery {
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
  warehouseIds?: string[];
  /** Omitted = all three. */
  kinds?: SalesItemReportRow["kind"][];
}

/**
 * GET /reports/sales-batches — Laporan › Batch terjual. One row per faktur ×
 * produk × batch, oldest faktur first, read off the stock movements (FEFO's
 * choice, not only lots picked by hand).
 */
export interface SalesBatchReportRow {
  invoiceNumber: string;
  invoiceDate: string | null;
  branchName: string | null;
  warehouseName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  source: "manual" | "pos_bridge";
  sku: string | null;
  productName: string | null;
  unit: string | null;
  batchCode: string | null;
  supplierBatchCode: string | null;
  /** `yyyy-mm-dd`; null on a lot of a product that does not expire. */
  expiryDate: string | null;
  isConsignment: boolean;
  supplierName: string | null;
  qty: string;
}

export interface SalesBatchReport {
  range: { fromDate: string | null; toDate: string | null } | null;
  rows: SalesBatchReportRow[];
}

export interface SalesBatchReportQuery {
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
  warehouseIds?: string[];
}

/**
 * GET /reports/pos-sales — Laporan › Penjualan POS. One row per shift opened in
 * the period. Per-method figures are net of refunds (the X-Report's); the
 * drawer figures of a closed shift are its signed Z-Report, null while open.
 */
export interface PosSalesReportRow {
  shiftNumber: string;
  branchName: string | null;
  warehouseName: string | null;
  cashierName: string | null;
  status: "open" | "closed";
  openedDate: string | null;
  openedTime: string | null;
  closedDate: string | null;
  closedTime: string | null;
  transactionCount: number;
  grossSales: string;
  returnCount: number;
  returns: string;
  netSales: string;
  cash: string;
  transfer: string;
  qris: string;
  edc: string;
  otherMethods: string;
  openingCash: string | null;
  expectedCash: string | null;
  countedCash: string | null;
  cashDifference: string | null;
  nonCashDifference: string | null;
  closingNotes: string | null;
}

export interface PosSalesReport {
  rows: PosSalesReportRow[];
}

export interface PosSalesReportQuery {
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
  warehouseIds?: string[];
  /** Omitted = open and closed alike. */
  statuses?: PosSalesReportRow["status"][];
}

/**
 * GET /reports/consignment-sales — Laporan › Penjualan konsinyasi. One row per
 * consignor × product; `amount` is what the period added to the setoran owed
 * (sales less returns and voids, at the consignor's price).
 */
export interface ConsignmentSalesReportRow {
  supplierName: string | null;
  sku: string | null;
  productName: string | null;
  unit: string | null;
  soldQty: string;
  returnedQty: string;
  netQty: string;
  unitPrice: string | null;
  soldAmount: string;
  returnedAmount: string;
  amount: string;
}

export interface ConsignmentSalesReport {
  rows: ConsignmentSalesReportRow[];
}

export interface ConsignmentSalesReportQuery {
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
  warehouseIds?: string[];
}

/**
 * GET /reports/sales-revenue — Laporan › Rincian pendapatan per produk. One
 * row per produk / layanan, largest `revenue` first.
 *
 * gross − discount − invoiceDiscount − tax = revenue (DPP, tax-exclusive);
 * revenue − cost = profit. `qtyNoCost` is the qty sold with no HPP recorded,
 * whose cost is therefore missing from `cost`.
 */
export interface SalesRevenueReportRow {
  kind: "product" | "service" | "membership";
  name: string | null;
  sku: string | null;
  unit: string | null;
  categoryName: string | null;
  qty: string;
  gross: string;
  discount: string;
  invoiceDiscount: string;
  tax: string;
  revenue: string;
  cost: string;
  profit: string;
  margin: number | null;
  qtyNoCost: string;
}

export interface SalesRevenueReport {
  range: { fromDate: string | null; toDate: string | null } | null;
  rows: SalesRevenueReportRow[];
}

export interface SalesRevenueReportQuery {
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
  warehouseIds?: string[];
  kinds?: SalesRevenueReportRow["kind"][];
}

/**
 * GET /reports/cash-flow — Laporan › Arus kas. Kas awal, the cash that moved
 * per section × journal source, kas akhir — and kas awal + Σ net = kas akhir,
 * which the server checks before it answers.
 */
export type CashFlowSection = "operating" | "investing" | "financing" | null;

export interface CashFlowAccountBalance {
  code: string;
  name: string;
  balance: string;
}

export interface CashFlowReport {
  range: { fromDate: string | null; toDate: string | null };
  opening: { total: string; accounts: CashFlowAccountBalance[] };
  sections: Array<{
    /** Null — cash that moved under an entry nobody classified. */
    type: CashFlowSection;
    inflow: string;
    outflow: string;
    net: string;
    lines: Array<{
      sourceType: JournalSourceType;
      entryCount: number;
      inflow: string;
      outflow: string;
      net: string;
    }>;
  }>;
  netChange: string;
  closing: { total: string; accounts: CashFlowAccountBalance[] };
}

export interface CashFlowReportQuery {
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
}

/**
 * GET /reports/ledger — Laporan › Saldo per akun: the buku besar. Per account,
 * in code order: its balance before the period, every line inside it with the
 * running balance, and its closing. Balances are signed by the account's
 * normal side, so an ordinary balance is positive.
 */
export interface LedgerReportLine {
  date: string;
  entryNumber: string;
  description: string | null;
  memo: string | null;
  sourceType: JournalSourceType;
  branchName: string | null;
  debit: string;
  credit: string;
  balance: string;
}

export interface LedgerReportAccount {
  code: string;
  name: string;
  accountType: AccountType;
  accountCategory: string;
  normalBalance: "debit" | "credit";
  opening: string;
  debit: string;
  credit: string;
  closing: string;
  lines: LedgerReportLine[];
}

export interface LedgerReport {
  range: { fromDate: string | null; toDate: string | null } | null;
  accounts: LedgerReportAccount[];
}

export interface LedgerReportQuery {
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
  /** Omitted = all five. */
  accountTypes?: AccountType[];
}

/**
 * GET /reports/expenses — Laporan › Biaya per kategori. One row per cost
 * account × lini bisnis. `direct` is what was posted to the lini, `allocated`
 * its share of the biaya bersama (negative on the unattributed row the rules
 * divided away), `total` the laba rugi's figure.
 */
export type ExpenseCategory = "hpp" | "biaya" | "biaya_lainnya";

export interface ExpenseReportRow {
  accountCategory: ExpenseCategory;
  code: string;
  name: string;
  /** Null — Belum Dipetakan: what no Sub Akun rule placed. */
  businessLineId: string | null;
  businessLineName: string | null;
  direct: string;
  allocated: string;
  total: string;
  share: number | null;
}

export interface ExpenseReport {
  range: { fromDate: string | null; toDate: string | null };
  allocation: { estimated: boolean };
  rows: ExpenseReportRow[];
}

export interface ExpenseReportQuery {
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
  /** Omitted = all three. */
  accountCategories?: ExpenseCategory[];
}

/**
 * GET /reports/aging — Laporan › Umur piutang & utang, AS OF TODAY. One row
 * per document still owed, piutang first; the remainder sits in exactly one
 * bucket column, aged from the due date.
 */
export type AgingKind = "receivable" | "payable";
export type AgingBucket =
  "current" | "days1to30" | "days31to60" | "days61to90" | "over90";

export interface AgingReportRow extends Record<AgingBucket, string | null> {
  kind: AgingKind;
  partyName: string | null;
  documentNumber: string;
  branchName: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  total: string;
  paid: string;
  outstanding: string;
  daysOverdue: number;
  bucket: AgingBucket;
}

export interface AgingReport {
  asOf: string | null;
  rows: AgingReportRow[];
}

export interface AgingReportQuery {
  branchIds?: string[];
  /** Omitted = both sides. */
  kinds?: AgingKind[];
}

/**
 * GET /reports/inventory-valuation — Laporan › Nilai persediaan at the end of
 * one day. Each shelf is priced at its product's average as of then; the
 * reconciliation against the Neraca's Persediaan accounts comes only for the
 * whole shop (null when a cabang or gudang narrowed it).
 */
export interface InventoryValuationRow {
  branchName: string | null;
  warehouseName: string | null;
  sku: string | null;
  productName: string | null;
  categoryName: string | null;
  unit: string | null;
  qty: string;
  averageCost: string;
  value: string;
}

export interface InventoryValuationReport {
  asOf: string | null;
  rows: InventoryValuationRow[];
  total: string;
  reconciliation: {
    accounts: Array<{ code: string; name: string; balance: string }>;
    ledgerTotal: string;
    difference: string;
  } | null;
}

export interface InventoryValuationQuery {
  /** `yyyy-mm-dd`, not in the future. */
  asOf: string;
  branchIds?: string[];
  warehouseIds?: string[];
}

/**
 * GET /reports/purchases — Laporan › Pembelian per supplier. One row per
 * supplier × product: received lines less submitted returns, ex-tax.
 */
export type PurchaseType = "beli_putus" | "konsinyasi";

export interface PurchasesReportRow {
  supplierName: string | null;
  sku: string | null;
  productName: string | null;
  categoryName: string | null;
  unit: string | null;
  receiptCount: number;
  lastReceiptDate: string | null;
  qty: string;
  amount: string;
  averageCost: string | null;
  returnedQty: string;
  returnedAmount: string;
  netQty: string;
  netAmount: string;
}

export interface PurchasesReport {
  rows: PurchasesReportRow[];
}

export interface PurchasesReportQuery {
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
  warehouseIds?: string[];
  /** Omitted = beli putus only. */
  purchaseTypes?: PurchaseType[];
}

/**
 * GET /reports/batch-expiry — Laporan › Batch & kedaluwarsa, as of today. One
 * row per lot still holding stock, soonest expiry first. `riskValue` is the
 * value of a lot of the shop's own that has expired or expires within 90 days.
 */
export type ExpiryStatus =
  "expired" | "within30" | "within90" | "within180" | "later" | "noExpiry";

export interface BatchExpiryReportRow {
  branchName: string | null;
  warehouseName: string | null;
  sku: string | null;
  productName: string | null;
  unit: string | null;
  batchCode: string | null;
  supplierBatchCode: string | null;
  receivedDate: string | null;
  expiryDate: string | null;
  daysLeft: number | null;
  status: ExpiryStatus;
  isConsignment: boolean;
  qtyRemaining: string;
  unitCost: string;
  value: string;
  riskValue: string | null;
}

export interface BatchExpiryReport {
  asOf: string;
  rows: BatchExpiryReportRow[];
}

export interface BatchExpiryReportQuery {
  branchIds?: string[];
  warehouseIds?: string[];
}
