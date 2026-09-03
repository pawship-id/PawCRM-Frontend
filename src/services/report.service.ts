import { apiClient } from "./api-client";
import type { StockOnHandQuery, StockOnHandResult } from "@/types/report";
import type {
  CommissionCloseResult,
  CommissionOutstanding,
  CommissionPaymentResult,
  CommissionRecap,
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
   * GET /reports/commissions — Rekap Komisi.
   *
   * GATED ON `users:read` SERVER-SIDE, not on a reports grant: this IS payroll
   * data — it names every groomer and what they are owed. Whoever may read the
   * staff register may read it.
   */
  /**
   * POST /reports/commissions/close — TUTUP BULAN KOMISI.
   *
   * Posts `Dr 5302 Beban Komisi Groomer / Cr 2102 Utang Komisi`, dated the last
   * day of the month rather than today: grooming done in September is a cost of
   * September even when payday falls in October.
   *
   * SAFE TO RUN AGAIN. It claims only the rows no close has taken, so a second
   * run picks up stragglers — a booking completed late — and nothing twice.
   * Gated on `journalEntries:create`, not on the recap's `users:read`.
   */
  closeCommissions: (input: { period: string; branchId: string }) =>
    apiClient.post<CommissionCloseResult>(
      "/reports/commissions/close",
      input,
    ),

  /**
   * GET /reports/commissions/outstanding — what one person is still owed.
   *
   * EVERYTHING CLOSED AND UNPAID, which may span several months: a groomer paid
   * in November for September and October is one payment. Not the recap's
   * monthly figure, and deliberately not derived from it.
   */
  outstandingCommissions: (query: {
    groomerUserId: string;
    branchId: string;
  }) =>
    apiClient.get<CommissionOutstanding>("/reports/commissions/outstanding", {
      query,
    }),

  /**
   * POST /reports/commissions/pay — settles what the books say is owed.
   *
   * `Dr 2102 Utang Komisi / Cr <the channel's account>`. NO AMOUNT IS SENT: the
   * server pays exactly what its own books say is outstanding, because a
   * caller-supplied figure would let a typo leave a liability matching nothing.
   */
  payCommissions: (input: {
    groomerUserId: string;
    branchId: string;
    paymentChannelId: string;
    paidAt?: string;
    note?: string | null;
  }) =>
    apiClient.post<CommissionPaymentResult>(
      "/reports/commissions/pay",
      input,
    ),

  commissions: (query: CommissionRecapQuery = {}) =>
    apiClient.get<CommissionRecap>("/reports/commissions", {
      query: {
        period: query.period,
        branchId: query.branchId,
        groomerUserId: query.groomerUserId,
      },
    }),
};
