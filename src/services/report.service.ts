import { apiClient } from "./api-client";
import type {
  ProductMovementReport,
  SalesInvoiceReport,
  SalesInvoiceReportQuery,
  SalesItemReport,
  SalesItemReportQuery,
  SalesBatchReport,
  SalesBatchReportQuery,
  PosSalesReport,
  PosSalesReportQuery,
  ConsignmentSalesReport,
  ConsignmentSalesReportQuery,
  SalesRevenueReport,
  SalesRevenueReportQuery,
  CashFlowReport,
  CashFlowReportQuery,
  LedgerReport,
  LedgerReportQuery,
  ExpenseReport,
  ExpenseReportQuery,
  AgingReport,
  AgingReportQuery,
  InventoryValuationReport,
  InventoryValuationQuery,
  PurchasesReport,
  PurchasesReportQuery,
  BatchExpiryReport,
  BatchExpiryReportQuery,
  OpnameDifferenceReport,
  OpnameDifferenceQuery,
  TransferReport,
  TransferReportQuery,
  ConsignmentOnHandReport,
  ConsignmentOnHandQuery,
  StaffPerformanceReport,
  StaffPerformanceQuery,
  BookingRecapReport,
  BookingRecapQuery,
  TopServicesReport,
  TopServicesQuery,
  StockOnHandQuery,
  StockOnHandResult,
} from "@/types/report";
import type {
  CommissionDetail,
  CommissionOutstanding,
  CommissionPayment,
  CommissionRecap,
  CommissionRowKey,
  CommissionRowsQuery,
  CommissionRowsResult,
  MyCommission,
  CommissionRecapQuery,
} from "@/types/api";

/**
 * Report calls against `/api/reports`.
 *
 * ONE REPORT LIVES HERE and that is not an oversight. Five of the seven in the
 * PRD are served by the module that owns their data — the stock card by
 * `stockMovement.service`, the expiry list and the consignment summary by
 * `productBatch.service`, the restock list by `product.service`, the opname
 * history by `stockOpname.service`. Re-exporting them through a `report`
 * namespace would create a second call site per report to keep in step with the
 * first, for no gain but symmetry.
 *
 * The seventh — sales per product — has no data behind it yet: there is no POS
 * and no invoice. It arrives with those modules.
 */
export const reportService = {
  /**
   * GET /reports/sales-invoices — Penjualan per invoice, every row of the
   * period at once (the server refuses past 10 000 rather than truncating).
   * Generous timeout: a year of a busy shop is a big answer.
   */
  salesInvoices: (query: SalesInvoiceReportQuery) =>
    apiClient.get<SalesInvoiceReport>("/reports/sales-invoices", {
      query: {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchIds: query.branchIds,
        warehouseIds: query.warehouseIds,
        statuses: query.statuses,
      },
      timeoutMs: 60_000,
    }),

  /**
   * GET /reports/sales-items — Penjualan per produk & layanan: the period's
   * sold lines summed per produk / layanan, kasir sales included.
   */
  salesItems: (query: SalesItemReportQuery) =>
    apiClient.get<SalesItemReport>("/reports/sales-items", {
      query: {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchIds: query.branchIds,
        warehouseIds: query.warehouseIds,
        kinds: query.kinds,
      },
      timeoutMs: 60_000,
    }),

  /**
   * GET /reports/sales-batches — Batch terjual: which lots left through the
   * period's sales, per faktur, for tracing a batch back to its buyers.
   */
  salesBatches: (query: SalesBatchReportQuery) =>
    apiClient.get<SalesBatchReport>("/reports/sales-batches", {
      query: {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchIds: query.branchIds,
        warehouseIds: query.warehouseIds,
      },
      timeoutMs: 60_000,
    }),

  /**
   * GET /reports/pos-sales — Penjualan POS: each shift's closing and its
   * takings per payment method.
   */
  posSales: (query: PosSalesReportQuery) =>
    apiClient.get<PosSalesReport>("/reports/pos-sales", {
      query: {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchIds: query.branchIds,
        warehouseIds: query.warehouseIds,
        statuses: query.statuses,
      },
      timeoutMs: 120_000,
    }),

  /**
   * GET /reports/consignment-sales — Penjualan konsinyasi: consigned goods
   * sold per supplier × product, the basis of the setoran.
   */
  consignmentSales: (query: ConsignmentSalesReportQuery) =>
    apiClient.get<ConsignmentSalesReport>("/reports/consignment-sales", {
      query: {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchIds: query.branchIds,
        warehouseIds: query.warehouseIds,
      },
      timeoutMs: 60_000,
    }),

  /**
   * GET /reports/sales-revenue — Rincian pendapatan per produk: revenue net of
   * every discount and the PPN in the price, against HPP.
   */
  salesRevenue: (query: SalesRevenueReportQuery) =>
    apiClient.get<SalesRevenueReport>("/reports/sales-revenue", {
      query: {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchIds: query.branchIds,
        warehouseIds: query.warehouseIds,
        kinds: query.kinds,
      },
      timeoutMs: 60_000,
    }),

  /**
   * GET /reports/cash-flow — Arus kas: kas awal, operasional / investasi /
   * pendanaan, kas akhir. Cabang only; cash sits in no gudang.
   */
  cashFlow: (query: CashFlowReportQuery) =>
    apiClient.get<CashFlowReport>("/reports/cash-flow", {
      query: {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchIds: query.branchIds,
      },
      timeoutMs: 60_000,
    }),

  /**
   * GET /reports/ledger — Saldo per akun: the buku besar, per account with
   * every journal line and its running balance.
   */
  ledger: (query: LedgerReportQuery) =>
    apiClient.get<LedgerReport>("/reports/ledger", {
      query: {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchIds: query.branchIds,
        accountTypes: query.accountTypes,
      },
      timeoutMs: 120_000,
    }),

  /**
   * GET /reports/expenses — Biaya per kategori: the laba rugi's costs per
   * lini, split into posted directly and allocated from the biaya bersama.
   */
  expenses: (query: ExpenseReportQuery) =>
    apiClient.get<ExpenseReport>("/reports/expenses", {
      query: {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchIds: query.branchIds,
        accountCategories: query.accountCategories,
      },
      timeoutMs: 60_000,
    }),

  /**
   * GET /reports/aging — Umur piutang & utang, as of today: every document
   * still owed both ways, by how late it is.
   */
  aging: (query: AgingReportQuery = {}) =>
    apiClient.get<AgingReport>("/reports/aging", {
      query: { branchIds: query.branchIds, kinds: query.kinds },
      timeoutMs: 60_000,
    }),

  /**
   * GET /reports/inventory-valuation — Nilai persediaan at one date, with the
   * reconciliation to the Neraca's Persediaan for the whole shop.
   */
  inventoryValuation: (query: InventoryValuationQuery) =>
    apiClient.get<InventoryValuationReport>("/reports/inventory-valuation", {
      query: {
        asOf: query.asOf,
        branchIds: query.branchIds,
        warehouseIds: query.warehouseIds,
      },
      timeoutMs: 120_000,
    }),

  /**
   * GET /reports/purchases — Pembelian per supplier: bought per supplier ×
   * SKU in a period, net of returns, ex-tax.
   */
  purchases: (query: PurchasesReportQuery) =>
    apiClient.get<PurchasesReport>("/reports/purchases", {
      query: {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchIds: query.branchIds,
        warehouseIds: query.warehouseIds,
        purchaseTypes: query.purchaseTypes,
      },
      timeoutMs: 60_000,
    }),

  /**
   * GET /reports/batch-expiry — Batch & kedaluwarsa: every lot still holding
   * stock, its shelf life left and the value at risk.
   */
  batchExpiry: (query: BatchExpiryReportQuery = {}) =>
    apiClient.get<BatchExpiryReport>("/reports/batch-expiry", {
      query: { branchIds: query.branchIds, warehouseIds: query.warehouseIds },
      timeoutMs: 60_000,
    }),

  /**
   * GET /reports/opname-differences — Selisih opname: every counted line of the
   * period's submitted sheets, with the journal each sheet posted.
   */
  opnameDifferences: (query: OpnameDifferenceQuery) =>
    apiClient.get<OpnameDifferenceReport>("/reports/opname-differences", {
      query: {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchIds: query.branchIds,
        warehouseIds: query.warehouseIds,
        onlyDifferences: query.onlyDifferences,
      },
      timeoutMs: 60_000,
    }),

  /**
   * GET /reports/transfers — Transfer antar gudang: what moved between gudang
   * and cabang in a period, lot by lot.
   */
  transfers: (query: TransferReportQuery) =>
    apiClient.get<TransferReport>("/reports/transfers", {
      query: {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchIds: query.branchIds,
        warehouseIds: query.warehouseIds,
        statuses: query.statuses,
      },
      timeoutMs: 60_000,
    }),

  /**
   * GET /reports/consignment-on-hand — Konsinyasi outstanding: titipan still
   * on the shelves, per supplier × product × gudang.
   */
  consignmentOnHand: (query: ConsignmentOnHandQuery = {}) =>
    apiClient.get<ConsignmentOnHandReport>("/reports/consignment-on-hand", {
      query: { branchIds: query.branchIds, warehouseIds: query.warehouseIds },
      timeoutMs: 60_000,
    }),

  /**
   * GET /reports/staff-performance — Performa staf: bookings, value, minutes
   * and punctuality per staff member over the period's finished bookings.
   */
  staffPerformance: (query: StaffPerformanceQuery) =>
    apiClient.get<StaffPerformanceReport>("/reports/staff-performance", {
      query: {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchIds: query.branchIds,
      },
      timeoutMs: 60_000,
    }),

  /**
   * GET /reports/booking-recap — Rekap booking: every booking scheduled in the
   * period, its status, cancellation and reschedules.
   */
  bookingRecap: (query: BookingRecapQuery) =>
    apiClient.get<BookingRecapReport>("/reports/booking-recap", {
      query: {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchIds: query.branchIds,
        statuses: query.statuses,
      },
      timeoutMs: 60_000,
    }),

  /**
   * GET /reports/top-services — Layanan terlaris: services and add-ons done in
   * the period, ranked by count and by value.
   */
  topServices: (query: TopServicesQuery) =>
    apiClient.get<TopServicesReport>("/reports/top-services", {
      query: {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchIds: query.branchIds,
        kinds: query.kinds,
      },
      timeoutMs: 60_000,
    }),

  /**
   * GET /reports/stock-on-hand — what is on every shelf, and what it is worth.
   *
   * Rows are per WAREHOUSE; grouping them into branches is the screen's job. A
   * branch may hold several warehouses, and collapsing them server-side would
   * hide stock stranded in the one nobody visits.
   */
  stockOnHand: (query: StockOnHandQuery = {}) =>
    apiClient.get<StockOnHandResult>("/reports/stock-on-hand", {
      query: {
        page: query.page,
        limit: query.limit,
        warehouseId: query.warehouseId,
        branchId: query.branchId,
        warehouseIds: query.warehouseIds,
        branchIds: query.branchIds,
        categoryId: query.categoryId,
        // Sent only when true: the server defaults it to false, and an explicit
        // `false` in the query string is noise in the browser's address bar.
        includeZero: query.includeZero || undefined,
      },
    }),

  /**
   * GET /reports/product-movement — what is selling and what is not.
   *
   * ONE CALL FOR BOTH LISTS on purpose; see `ProductMovementReport`. The two
   * windows are separate parameters because the screen fixes one and lets the
   * reader choose the other.
   */
  productMovement: (
    query: {
      warehouseId?: string;
      /** Every gudang filed under this cabang, plus the branchless ones. */
      branchId?: string;
      /** Sets of either — sent as repeated params. */
      warehouseIds?: string[];
      branchIds?: string[];
      days?: number;
      idleDays?: number;
      limit?: number;
    } = {},
  ) =>
    apiClient.get<ProductMovementReport>("/reports/product-movement", {
      query: {
        warehouseId: query.warehouseId || undefined,
        branchId: query.branchId || undefined,
        warehouseIds: query.warehouseIds,
        branchIds: query.branchIds,
        days: query.days,
        idleDays: query.idleDays,
        limit: query.limit,
      },
    }),

  /**
   * GET /reports/stock-on-hand/export — every matching row, as CSV.
   *
   * `download` rather than `get`: the server answers with the file itself, not
   * the `{ success, data }` envelope. A failure still arrives as JSON and is
   * parsed as one, so a 400 does not silently save a file containing
   * `{"success":false}`.
   *
   * NO PAGING, and the API forbids it rather than ignoring it — an export is the
   * whole filtered set by definition, and a `limit` would hand back a file that
   * looks complete and is missing everything past row 20. `page` and `limit` are
   * therefore absent from the type below rather than merely unsent.
   *
   * Generous timeout, like the ledger export: this streams a whole catalogue and
   * the row count is the tenant's, not ours.
   */
  exportStockOnHand: (query: Omit<StockOnHandQuery, "page" | "limit"> = {}) =>
    apiClient.download("/reports/stock-on-hand/export", {
      query: {
        warehouseId: query.warehouseId,
        branchId: query.branchId,
        warehouseIds: query.warehouseIds,
        branchIds: query.branchIds,
        categoryId: query.categoryId,
        includeZero: query.includeZero || undefined,
      },
      fallbackFilename: "stok-per-cabang.csv",
      timeoutMs: 60_000,
    }),

  /**
   * GET /reports/commissions/records — the Komisi screen: one row per booking ×
   * groomer, the context bar's scope, and the three cards.
   *
   * GATED ON `users:read` SERVER-SIDE, not on a finance grant: this IS payroll —
   * it names every groomer and what they earned.
   */
  commissionRecords: (query: CommissionRowsQuery = {}) =>
    apiClient.get<CommissionRowsResult>("/reports/commissions/records", {
      query: {
        branchId: query.branchId || undefined,
        businessLineId: query.businessLineId || undefined,
        branchIds: query.branchIds,
        businessLineIds: query.businessLineIds,
        dateFrom: query.dateFrom || undefined,
        dateTo: query.dateTo || undefined,
        status: query.status || undefined,
        q: query.q?.trim() || undefined,
        sort: query.sort,
        dir: query.dir,
        page: query.page,
        limit: query.limit,
      },
    }),

  /** GET /reports/commissions/records/:bookingId/:groomerUserId — one row, whole. */
  commissionDetail: ({ bookingId, groomerUserId }: CommissionRowKey) =>
    apiClient.get<CommissionDetail>(
      `/reports/commissions/records/${bookingId}/${groomerUserId}`,
    ),

  /**
   * POST /reports/commissions/approve — Menunggu Persetujuan → Disetujui. Rows
   * that are not pending are skipped, and counted in `skipped`.
   */
  approveCommissions: (rows: CommissionRowKey[]) =>
    apiClient.post<{ approved: number; skipped: number }>(
      "/reports/commissions/approve",
      { rows },
    ),

  /** POST /reports/commissions/unapprove — Disetujui → Menunggu Persetujuan. */
  unapproveCommissions: (rows: CommissionRowKey[]) =>
    apiClient.post<{ unapproved: number; skipped: number }>(
      "/reports/commissions/unapprove",
      { rows },
    ),

  /**
   * POST /reports/commissions/override — Nilai Komisi Final. `amount: null`
   * goes back to the computed figure; a different figure needs a reason.
   */
  overrideCommission: (
    input: CommissionRowKey & { amount: string | null; reason?: string | null },
  ) => apiClient.post<CommissionDetail>("/reports/commissions/override", input),

  /**
   * GET /reports/commissions/outstanding — what one person is still owed.
   *
   * EVERYTHING CLOSED AND UNPAID, which may span several months: a groomer paid
   * in November for September and October is one payment. Not the recap's
   * monthly figure, and deliberately not derived from it.
   */
  /**
   * GET /reports/commissions/mine — the signed-in person's own commission.
   *
   * NO GRANT BEYOND BEING SIGNED IN, and no way to name anybody else: the server
   * reads the person from the SESSION. The recap beside it is the whole shop's
   * payroll and needs `users:read`, which is why this route exists at all — a
   * groomer could otherwise see everybody's pay or nobody's.
   */
  myCommissions: (query: { period?: string } = {}) =>
    apiClient.get<MyCommission>("/reports/commissions/mine", { query }),

  outstandingCommissions: (query: {
    groomerUserId: string;
    branchId: string;
  }) =>
    apiClient.get<CommissionOutstanding>("/reports/commissions/outstanding", {
      query,
    }),

  /**
   * POST /reports/commissions/pay — ONE COMMISSION, ONE PAYMENT, ONE JOURNAL
   * ENTRY. Every row must be approved; all of them are paid out of one Kas &
   * Bank account, or none are. NO AMOUNT IS SENT: each row pays its own
   * effective commission.
   */
  payCommissions: (input: {
    rows: CommissionRowKey[];
    accountId: string;
    paidAt?: string;
    note?: string | null;
  }) =>
    apiClient.post<{ payments: CommissionPayment[] }>(
      "/reports/commissions/pay",
      input,
    ),

  /**
   * GET /reports/commissions — per-groomer recap. Only Komisi Saya reads it now,
   * through `/mine`; kept for the reports that may want a monthly total.
   */
  commissions: (query: CommissionRecapQuery = {}) =>
    apiClient.get<CommissionRecap>("/reports/commissions", {
      query: {
        period: query.period,
        branchId: query.branchId,
        groomerUserId: query.groomerUserId,
      },
    }),
};
