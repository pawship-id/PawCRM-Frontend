import type { BookingStatus, TripLeg } from "./api";
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
  /** The till's own number (POS-…); a marketplace order's, once one syncs in. */
  reference: string | null;
  branchName: string | null;
  /** The cabang for a counter or hand-raised sale; a marketplace store's name later. */
  storeName: string | null;
  /** The invoice's gudang, or its till sale's. */
  warehouseName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  /** The tenant's own label (Pengaturan › Tipe pelanggan); null when unset. */
  customerTypeName: string | null;
  source: "manual" | "pos_bridge" | "shopee_import";
  channel: "manual" | "marketplace";
  /** "Umum" for a counter or hand-raised sale; the expedition's name later. */
  courierName: string | null;
  lineCount: number;
  qtyTotal: string | null;
  subtotal: string | null;
  itemDiscount: string | null;
  invoiceDiscount: string | null;
  /** A marketplace's own discount — nothing writes one yet. */
  otherDiscount: string | null;
  otherCharges: string | null;
  /** The charges by name — Ongkir, Packaging. */
  otherChargeLabels: string[];
  dpp: string | null;
  tax: string | null;
  taxRate: number | null;
  /** The prices held the PPN; null where there was no PPN. */
  taxInclusive: boolean | null;
  /** Subtotal − both discounts + charges: the bill before PPN is added on. */
  netTotal: string | null;
  /** What the customer owes, PPN included — Grand total. */
  total: string;
  paidAmount: string;
  outstandingAmount: string;
  status: "unpaid" | "partial" | "paid" | "void";
  isOverdue: boolean;
  createdByName: string | null;
  /** The accounts/channels the receipts that still count arrived in. */
  paymentAccountNames: string[];
  /** cash, transfer, qris, edc, giro — one per distinct receipt method. */
  paymentMethods: string[];
  /** The till's device for a kasir sale; who raised it for a manual faktur. */
  cashierName: string | null;
  /** Any goods that left were titipan. */
  isConsignment: boolean;
  consignorNames: string[];
  notes: string | null;
  voidReason: string | null;
  /** Present only when asked with `withLines` — the rincian barang file. */
  lines?: SalesInvoiceReportLine[];
}

/** One sold line of an invoice, as the rincian barang file prints it. */
export interface SalesInvoiceReportLine {
  kind: "product" | "service" | "membership";
  sku: string | null;
  name: string | null;
  /** A product's category; a service's kelompok (Grooming, Hotel). */
  categoryName: string | null;
  unit: string | null;
  qty: string | null;
  unitPrice: string | null;
  /** The line's own discount. */
  discount: string;
  /** qty × price, before the line's discount. */
  lineTotal: string;
  /** `lineTotal` − `discount`: before the invoice discount and PPN. */
  net: string;
  /** Its share of the invoice discount, split by `net`. */
  invoiceDiscount: string;
  /** Its share of the PPN; null where the invoice kept no breakdown. */
  tax: string | null;
  /** Its tax-exclusive pendapatan — Nett sales, as the laba rugi credits it. */
  revenue: string;
  /** qty × HPP at the sale; null on a product with no HPP recorded. */
  cost: string | null;
  /** `revenue` − `cost`; null where `cost` is. */
  profit: string | null;
  /** The sales sub akun it was booked to, as "code name". */
  salesAccountName: string | null;
  /** The goods that left for it were titipan. */
  isConsignment: boolean;
  consignorNames: string[];
}

export interface SalesInvoiceReportQuery {
  /** `yyyy-mm-dd`, both required and inclusive; at most 366 days apart. */
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
  warehouseIds?: string[];
  /** Omitted = every status but `void`. */
  statuses?: SalesInvoiceReportRow["status"][];
  /** Each invoice's lines along with it, as `lines`. */
  withLines?: boolean;
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
  source: "manual" | "pos_bridge" | "shopee_import";
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
 * GET /reports/sales-revenue — Laporan › Rincian pendapatan per produk. The
 * period's non-cancelled invoices, each with its lines (only the `kinds` asked
 * for); the file prints one row per line. Per line:
 *
 * lineTotal − discount − invoiceDiscount − (tax, when inside the price)
 *   = revenue (Nett sales); revenue − cost = profit.
 */
export interface SalesRevenueReport {
  range: { fromDate: string | null; toDate: string | null } | null;
  rows: (SalesInvoiceReportRow & { lines: SalesInvoiceReportLine[] })[];
}

export interface SalesRevenueReportQuery {
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
  warehouseIds?: string[];
  kinds?: SalesInvoiceReportLine["kind"][];
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

/**
 * GET /reports/opname-differences — Laporan › Selisih opname. One row per
 * counted line of a submitted sheet, with the journal entry the sheet posted.
 */
export interface OpnameDifferenceRow {
  opnameNumber: string;
  opnameDate: string;
  branchName: string | null;
  warehouseName: string | null;
  submittedByName: string | null;
  sku: string | null;
  productName: string | null;
  unit: string | null;
  batchCode: string | null;
  systemQty: string;
  physicalQty: string;
  diffQty: string;
  direction: "short" | "over" | "match";
  unitCost: string;
  diffValue: string;
  lineNotes: string | null;
  sheetNotes: string | null;
  sheetDiffValue: string;
  entryNumber: string | null;
  posting: string | null;
}

export interface OpnameDifferenceReport {
  rows: OpnameDifferenceRow[];
}

export interface OpnameDifferenceQuery {
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
  warehouseIds?: string[];
  /** Default true: lines that counted what the system expected are left out. */
  onlyDifferences?: boolean;
}

/**
 * GET /reports/transfers — Laporan › Transfer antar gudang. One row per
 * transfer × product × lot its current posting moved.
 */
export type TransferStatus = "in_transit" | "received" | "cancelled";

export interface TransferReportRow {
  transferNumber: string;
  transferDate: string | null;
  status: TransferStatus;
  fromBranchName: string | null;
  fromWarehouseName: string | null;
  toBranchName: string | null;
  toWarehouseName: string | null;
  crossBranch: boolean;
  sku: string | null;
  productName: string | null;
  unit: string | null;
  batchCode: string | null;
  expiryDate: string | null;
  qty: string;
  value: string;
  receivedDate: string | null;
  cancelledDate: string | null;
  revision: number;
  createdByName: string | null;
  receivedByName: string | null;
  notes: string | null;
}

export interface TransferReport {
  rows: TransferReportRow[];
}

export interface TransferReportQuery {
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
  /** Either end of the transfer. */
  warehouseIds?: string[];
  /** Omitted = every status. */
  statuses?: TransferStatus[];
}

/**
 * GET /reports/consignment-on-hand — Laporan › Konsinyasi outstanding, as of
 * now. One row per consignor × product × gudang, valued at the harga setor.
 */
export interface ConsignmentOnHandRow {
  supplierName: string | null;
  branchName: string | null;
  warehouseName: string | null;
  sku: string | null;
  productName: string | null;
  unit: string | null;
  lotCount: number;
  qty: string;
  unitCost: string | null;
  value: string;
  oldestReceivedDate: string | null;
  daysHeld: number | null;
  nearestExpiry: string | null;
}

export interface ConsignmentOnHandReport {
  asOf: string;
  rows: ConsignmentOnHandRow[];
}

export interface ConsignmentOnHandQuery {
  branchIds?: string[];
  warehouseIds?: string[];
}

/**
 * GET /reports/staff-performance — Laporan › Performa staf. One row per staff
 * member on the period's finished bookings. Value and minutes are their share
 * (split by turn and crew, as commission is); punctuality is per booking.
 */
export interface StaffPerformanceRow {
  staffName: string | null;
  bookingCount: number;
  sessionCount: number;
  value: string;
  minutes: number;
  averageValue: string | null;
  measuredStart: number;
  onTimeStartRate: number | null;
  averageLateMinutes: number | null;
  measuredFinish: number;
  onTimeFinishRate: number | null;
}

export interface StaffPerformanceReport {
  rows: StaffPerformanceRow[];
}

export interface StaffPerformanceQuery {
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
}

/**
 * GET /reports/booking-recap — Laporan › Rekap booking. One row per booking
 * scheduled in the period, with its cancellation and reschedules read off the
 * status trail (the date a reschedule moved FROM is not stored).
 */
export interface BookingRecapRow {
  bookingNumber: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  branchName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  petName: string | null;
  serviceName: string | null;
  location: "in_store" | "in_home" | null;
  origin: "booking" | "pos_adhoc" | "invoice_adhoc" | null;
  tripLeg: TripLeg | null;
  status: BookingStatus;
  staffNames: string;
  netAmount: string;
  createdDate: string | null;
  createdByName: string | null;
  rescheduleCount: number;
  lastRescheduledDate: string | null;
  cancelledDate: string | null;
  cancelReason: string | null;
  completedDate: string | null;
}

export interface BookingRecapReport {
  rows: BookingRecapRow[];
}

export interface BookingRecapQuery {
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
  /** Omitted = every status. */
  statuses?: BookingStatus[];
}

/**
 * GET /reports/top-services — Laporan › Layanan terlaris. One row per service
 * or add-on done on the period's finished bookings, main services first, each
 * kind ranked on its own by count and by value.
 */
export type ServiceKind = "main" | "addon";

export interface TopServiceRow {
  kind: ServiceKind;
  rankByCount: number;
  rankByValue: number;
  name: string | null;
  categoryName: string | null;
  count: number;
  bookingCount: number;
  gross: string;
  discount: string;
  net: string;
  averagePrice: string | null;
  share: number | null;
}

export interface TopServicesReport {
  rows: TopServiceRow[];
}

export interface TopServicesQuery {
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
  /** Omitted = both. */
  kinds?: ServiceKind[];
}

/**
 * GET /reports/commission-payroll — Laporan › Rekap komisi. One row per
 * groomer × month × cabang, at the Komisi screen's effective amounts.
 */
export interface CommissionPayrollRow {
  /** `YYYY-MM`. */
  period: string;
  staffName: string | null;
  branchName: string | null;
  bookingCount: number;
  basis: string;
  amount: string;
  pending: string;
  approved: string;
  paid: string;
  unpaid: string;
  overriddenCount: number;
  reversedCount: number;
}

export interface CommissionPayrollReport {
  rows: CommissionPayrollRow[];
}

export interface CommissionPayrollQuery {
  dateFrom: string;
  dateTo: string;
  branchIds?: string[];
}
