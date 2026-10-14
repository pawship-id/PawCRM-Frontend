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
