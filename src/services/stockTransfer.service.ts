import { apiClient } from "./api-client";
import type {
  StockTransferDetail,
  StockTransferInput,
  StockTransferListQuery,
  StockTransferPage,
} from "@/types/inventory";

/**
 * Stock transfers, against /api/stock-transfers.
 *
 * One typed domain operation per apiClient request, no React and no state, like
 * every other service here. The tenant scope comes from the session cookie.
 *
 * A TRANSFER IS A DOCUMENT WITH A LIFE: filed (the goods leave the source),
 * edited while in transit, then received (the goods arrive) or cancelled. Each
 * of those is its own call, and the server — not this file — decides what each
 * does to the ledger. The ledger itself is still append-only: an edit is a
 * reversal and a re-post on the server, and a client never sees that.
 *
 * Every write answers with the WHOLE document, so a screen can replace what it
 * holds rather than refetching.
 */
export const stockTransferService = {
  /** GET /stock-transfers — a page of transfers, newest first by default. */
  list: (query: StockTransferListQuery = {}) =>
    apiClient.get<StockTransferPage>("/stock-transfers", {
      query: {
        page: query.page,
        limit: query.limit,
        warehouseId: query.warehouseId,
        status: query.status,
        from: query.from,
        to: query.to,
        search: query.search,
        sort: query.sort,
      },
    }),

  /** GET /stock-transfers/:id — the document, its lines and its arrivals. */
  getById: (id: string) =>
    apiClient.get<StockTransferDetail>(`/stock-transfers/${id}`),

  /** POST /stock-transfers — files a transfer; the goods leave the source (201). */
  create: (input: StockTransferInput) =>
    apiClient.post<StockTransferDetail>("/stock-transfers", input),

  /**
   * PATCH /stock-transfers/:id — corrects a transfer that has not been received.
   * A 409 once it has been received or cancelled.
   */
  update: (id: string, input: StockTransferInput) =>
    apiClient.patch<StockTransferDetail>(`/stock-transfers/${id}`, input),

  /** POST /stock-transfers/:id/receive — the goods arrive at the destination. */
  receive: (id: string) =>
    apiClient.post<StockTransferDetail>(`/stock-transfers/${id}/receive`),

  /** POST /stock-transfers/:id/cancel — the goods go back to the source. */
  cancel: (id: string) =>
    apiClient.post<StockTransferDetail>(`/stock-transfers/${id}/cancel`),
};
