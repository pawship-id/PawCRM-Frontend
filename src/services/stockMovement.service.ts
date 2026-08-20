import { apiClient } from "./api-client";
import type {
  CreateStockMovementInput,
  PreviewStockMovementInput,
  StockMovement,
  StockMovementListQuery,
  StockMovementPage,
  StockMovementPreview,
  StockMovementSummary,
  StockTransferListQuery,
  StockTransferPage,
} from "@/types/inventory";

/**
 * The stock ledger, against /api/stock-movements.
 *
 * One typed domain operation per apiClient request, no React and no state, like
 * every other service here. The tenant scope comes from the session cookie on
 * the backend, so it is never passed.
 *
 * ONE WRITE, AND IT IS THE WHOLE WRITE SURFACE. `create` posts a manual
 * adjustment or a manual transfer — the only two things a client may put in this
 * ledger. A goods receipt, a POS sale, a bundle consumption and an opname
 * difference are all posted service-to-service by the module that owns the
 * document, because a client able to claim a receipt could conjure stock that no
 * purchase order accounts for.
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

/**
 * The filters the summary and the export share with the list.
 *
 * `sort` is excluded alongside paging, and for the same kind of reason: a
 * summary is one row of totals with no order, and an export has its own, fixed
 * oldest-first so its running balance can accumulate. The API rejects `sort` on
 * both.
 */
type FilterQuery = Omit<StockMovementListQuery, "page" | "limit" | "sort">;

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
    search: query.search,
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
        // List only — see FilterQuery.
        sort: query.sort,
        ...filterParams(query),
      },
    }),

  /**
   * GET /stock-movements/transfers — the manual transfers, one row per TRANSFER.
   *
   * NOT `list({ referenceType: "transfer_manual" })`, which returns the ledger
   * ROWS. A transfer has no document of its own — nothing to hang a header off —
   * so its rows are tied together only by the correlation id the server puts in
   * `reference.id`, and grouping a page of rows in the browser would page rows:
   * one transfer could straddle a page boundary and show up twice, each time
   * with half its lots. The server groups and pages the groups.
   *
   * To read ONE transfer's lines, go back to `list` with that transfer's id:
   * `list({ referenceType: "transfer_manual", referenceId })`.
   */
  listTransfers: (query: StockTransferListQuery = {}) =>
    apiClient.get<StockTransferPage>("/stock-movements/transfers", {
      query: {
        page: query.page,
        limit: query.limit,
        warehouseId: query.warehouseId,
        from: query.from,
        to: query.to,
        search: query.search,
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

  /**
   * POST /stock-movements — a manual adjustment or a manual transfer (201).
   *
   * RETURNS AN ARRAY, ALWAYS, and callers must not assume one row. FEFO splits a
   * withdrawal across every lot it draws from — "keluarkan 10" over three lots is
   * three rows — and a transfer produces a pair per lot moved. The array is what
   * actually landed in the ledger, so a form should report its length rather than
   * the quantity the user typed.
   *
   * The client sends an `operation`, not a `movementType`: the server decides
   * the type, the reference, the signs and how many rows come out. See
   * CreateStockMovementInput.
   */
  create: (input: CreateStockMovementInput) =>
    apiClient.post<StockMovement[]>("/stock-movements", input),

  /**
   * POST /stock-movements/preview — what `create` would write, without writing.
   *
   * 200, not 201: it makes nothing. It refuses exactly what the create refuses,
   * so a form learns about an inactive warehouse before the user presses save
   * rather than after.
   *
   * THIS REPLACED A FILE. The frontend used to reimplement FEFO allocation, the
   * perpetual weighted average and the journal's counter account in
   * `features/inventory/utils/preview.ts`. Those copies agreed with the server —
   * right up until the day they would not have, silently, in a preview a user
   * had already approved.
   */
  preview: (input: PreviewStockMovementInput) =>
    apiClient.post<StockMovementPreview>("/stock-movements/preview", input),
};
