import { apiClient } from "./api-client";
import type { StockOnHandQuery, StockOnHandResult } from "@/types/report";
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
        categoryId: query.categoryId,
        // Sent only when true: the server defaults it to false, and an explicit
        // `false` in the query string is noise in the browser's address bar.
        includeZero: query.includeZero || undefined,
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
  ) =>
    apiClient.post<CommissionDetail>("/reports/commissions/override", input),

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
