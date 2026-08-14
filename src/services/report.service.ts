import { apiClient } from "./api-client";
import type { StockOnHandQuery, StockOnHandResult } from "@/types/report";

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
};
