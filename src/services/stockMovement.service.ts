import { apiClient } from "./api-client";
import type {
  StockMovement,
  StockMovementListQuery,
  StockMovementPage,
  StockMovementSummary,
} from "@/types/inventory";

/**
 * The stock ledger, against /api/stock-movements.
 *
 * One typed domain operation per apiClient request, no React and no state, like
 * every other service here. The tenant scope comes from the session cookie on
 * the backend, so it is never passed.
 *
 * READ-ONLY, AND THAT IS THE WHOLE FILE. The API does expose `POST` for a manual
 * adjustment and a manual transfer, but those belong to the forms that own them
 * (StockAdjustmentForm, StockTransferForm) and are added when those screens are
 * wired — a stock card reads the ledger and never writes to it.
 *
 * There is no `update`, no `remove` and no `restore` here or on the API: the
 * ledger is append-only. A wrong movement is corrected by posting a reversing
 * adjustment, which leaves both the error and the correction visible.
 *
 * THE ROWS ARRIVE COMPUTED, and nothing here recomputes them. Each carries its
 * own `balanceAfter` — summed server-side over the whole ledger of the pair,
 * including the rows the filters hide — plus the labels behind its ids. The one
 * field still missing is `referenceNo`; see types/inventory.ts.
 */

/** The three filters that are also the export's, minus paging. */
type FilterQuery = Omit<StockMovementListQuery, "page" | "limit">;

/**
 * Spread into a fresh object literal to satisfy apiClient's
 * `Record<string, ...>` query type — it drops the undefined entries, so an unset
 * filter is not sent at all. Shared by all three calls so the summary's totals
 * and the export's rows describe exactly the set the list is showing.
 */
function filterParams(query: FilterQuery) {
  return {
    productId: query.productId,
    warehouseId: query.warehouseId,
    batchId: query.batchId,
    movementType: query.movementType,
    referenceType: query.referenceType,
    referenceId: query.referenceId,
    from: query.from,
    to: query.to,
  };
}

export const stockMovementService = {
  /**
   * GET /stock-movements — a page of the ledger, newest first.
   *
   * With `productId` + `warehouseId` this IS the stock card; the backend has no
   * separate route because that is all a stock card is. Those two also decide
   * whether `balanceAfter` and `openingBalance` come back as numbers or as null.
   */
  list: (query: StockMovementListQuery = {}) =>
    apiClient.get<StockMovementPage>("/stock-movements", {
      query: {
        page: query.page,
        limit: query.limit,
        ...filterParams(query),
      },
    }),

  /**
   * GET /stock-movements/summary — totals for the whole filtered set.
   *
   * Takes no paging, deliberately: a total that depended on a page would not be
   * a total. It is a separate request from `list` rather than a field on it
   * because it is asked once while the list behind it is paged through.
   */
  summary: (query: FilterQuery = {}) =>
    apiClient.get<StockMovementSummary>("/stock-movements/summary", {
      query: filterParams(query),
    }),

  /**
   * GET /stock-movements/export — the same rows as a CSV file.
   *
   * Returns the blob rather than triggering the save, so the caller decides what
   * to do with it and an error can still be shown in the UI. A plain anchor to
   * the API would be fewer lines and would turn a 403 into a downloaded file
   * containing an error envelope.
   *
   * `limit` is deliberately absent: the server ignores it, because an export
   * that stopped at a page boundary would be a partial audit document that opens
   * and looks complete.
   */
  export: (query: FilterQuery = {}) =>
    apiClient.download("/stock-movements/export", {
      query: { ...filterParams(query), format: "csv" },
      fallbackFilename: "kartu-stok.csv",
      // Generous next to the default 15s: an export streams the whole ledger,
      // and the row count is the tenant's, not ours.
      timeoutMs: 60_000,
    }),

  /** GET /stock-movements/:id — one row (404 for another tenant's). */
  getById: (id: string) =>
    apiClient.get<StockMovement>(`/stock-movements/${id}`),
};
