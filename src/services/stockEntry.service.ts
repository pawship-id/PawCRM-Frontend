import { apiClient } from "./api-client";
import type { PageResult } from "@/types/api";
import type {
  StockEntry,
  StockEntryKind,
  StockEntryInput,
  StockEntryListQuery,
} from "@/types/inventory";

/**
 * The hand-typed stock documents — /api/stock-entries.
 *
 * WHAT THIS RESOURCE IS. Not the ledger: the movements are still written by
 * StockMovementService and still read from the stock card. These are the
 * PAPERWORK over them — a header, a number, and a list. One adjustment fans out
 * across every lot FEFO draws from, so before this collection existed the ledger
 * could count rows and never events, and nothing had a name an audit could ask
 * for.
 *
 * TWO CREATE METHODS, NOT ONE TAKING A `kind`, because the two endpoints are
 * gated differently on the server — an adjustment is a ledger correction
 * (`stockMovements:create`), opening stock the continuation of registering a
 * catalogue (`products:create`). A single method would have hidden a permission
 * difference behind a parameter.
 *
 * NO UPDATE AND NO DELETE, and none to add. A posted document describes
 * movements that cannot be unwritten; editing it would leave the paperwork
 * disagreeing with the stock it moved. A document typed in error is answered by
 * a second one correcting it.
 */
export const stockEntryService = {
  /**
   * GET /stock-entries — one page of one kind, newest first.
   *
   * `kind` is REQUIRED by the API: the two are read on different screens and
   * mean different things to the books, and an unfiltered list would mix a
   * shop's day-one capital with its breakages.
   */
  list: (query: StockEntryListQuery) =>
    apiClient.get<PageResult<StockEntry>>("/stock-entries", {
      query: {
        page: query.page,
        limit: query.limit,
        kind: query.kind,
        branchId: query.branchId,
        warehouseId: query.warehouseId,
        search: query.search,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      },
    }),

  /**
   * GET /stock-entries/:id — one document, with its lines and their labels.
   *
   * `kind` IS SENT, and on a read by id it looks redundant until you remember
   * the two live in separate collections: an id alone does not say which, and
   * the server will not probe both. The caller always knows — it arrived from
   * one of the two lists.
   */
  getById: (id: string, kind: StockEntryKind) =>
    apiClient.get<StockEntry>(`/stock-entries/${id}`, { query: { kind } }),

  /**
   * POST /stock-entries/adjustments — a correction (201).
   *
   * `qty` per line is the SIGNED change, and `systemQty` rides along as a record
   * of what the screen was showing when somebody decided. Nothing is validated
   * against the second: it describes the decision, and a balance re-read on the
   * server would answer a different question than the user answered.
   */
  createAdjustment: (input: StockEntryInput) =>
    apiClient.post<StockEntry>("/stock-entries/adjustments", input),

  /**
   * POST /stock-entries/opening-stock — day-one stock (201).
   *
   * Posts `opening_balance`, which credits 3101 Modal / Saldo Awal. Refused for
   * any product that has ever moved in that warehouse, by SKU, in one answer —
   * the server owns that rule because the answer lives in the ledger.
   */
  createOpeningStock: (input: StockEntryInput) =>
    apiClient.post<StockEntry>("/stock-entries/opening-stock", input),
};
