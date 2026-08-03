import { apiClient } from "./api-client";
import type { PageResult } from "@/types/api";
import type {
  ExpiringBatchListQuery,
  ExpiringBatchesResult,
  ProductBatch,
  ProductBatchListQuery,
} from "@/types/inventory";

/**
 * Lots, against /api/product-batches.
 *
 * READ-ONLY, mirroring the API exactly: there is no `POST`, `PATCH` or `DELETE`
 * to wrap. A batch is BORN from a stock movement — a goods receipt or an inbound
 * adjustment — and its `qtyRemaining` moves only as FEFO picks from it. A write
 * would let a client declare stock no movement accounts for, and a replay of the
 * ledger would then disagree with the row.
 *
 * The list arrives sorted closest-to-expiring first, which is both the order a
 * human wants and the order FEFO consumes them in, so no caller re-sorts by
 * expiry. What callers DO reorder is live-before-exhausted, which is a display
 * choice rather than a correction.
 */
export const productBatchService = {
  /**
   * GET /product-batches — lots, filterable by product and warehouse.
   *
   * `hasRemaining` is TRI-STATE and deliberately has no default: left unset the
   * API returns exhausted lots too, which is how somebody audits a lot that has
   * already sold out. Pass `true` only where spent rows are noise.
   */
  list: (query: ProductBatchListQuery = {}) =>
    apiClient.get<PageResult<ProductBatch>>("/product-batches", {
      query: {
        page: query.page,
        limit: query.limit,
        productId: query.productId,
        warehouseId: query.warehouseId,
        hasRemaining: query.hasRemaining,
      },
    }),

  /**
   * GET /product-batches/expiring — the alert list: lots that still hold
   * something and expire within `withinDays` (0–365, default 30 on the server).
   *
   * Already-expired lots are INCLUDED and sort to the top — the stock that most
   * urgently needs pulling off a shelf is the batch that expired last week and
   * is still sitting there sellable.
   */
  expiring: (query: ExpiringBatchListQuery = {}) =>
    apiClient.get<ExpiringBatchesResult>("/product-batches/expiring", {
      query: {
        page: query.page,
        limit: query.limit,
        warehouseId: query.warehouseId,
        withinDays: query.withinDays,
      },
    }),

  /** GET /product-batches/:id — one lot. */
  getById: (id: string) => apiClient.get<ProductBatch>(`/product-batches/${id}`),
};
