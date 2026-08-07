import { apiClient } from "./api-client";
import type {
  GoodsReceiptListQuery,
  GoodsReceiptListRow,
  PageResult,
  SupplierPurchaseSummary,
} from "@/types/api";

/**
 * Goods receipts, against /api/goods-receipts.
 *
 * READ-ONLY HERE, and narrower than the API on purpose: receiving goods is the
 * irreversible operation of the purchasing module — it moves stock, restates the
 * weighted average cost and creates the payable — and the screen that does it
 * still runs on the prototype store. Wrapping `POST` before that screen is
 * converted would put two ways to receive goods in the codebase at once.
 *
 * What IS wrapped is what the supplier screens read: a vendor's delivery history,
 * and the per-supplier totals behind their stats.
 */
export const goodsReceiptService = {
  /**
   * GET /goods-receipts — deliveries, newest first, filterable by supplier.
   *
   * The supplier detail screen passes `supplierId` and a small `limit`: it shows
   * the recent history, not the whole book, and the count it displays comes from
   * `summary` rather than from paging through this.
   */
  list: (query: GoodsReceiptListQuery = {}) =>
    apiClient.get<PageResult<GoodsReceiptListRow>>("/goods-receipts", {
      query: {
        page: query.page,
        limit: query.limit,
        search: query.search,
        supplierId: query.supplierId,
        warehouseId: query.warehouseId,
        purchaseType: query.purchaseType,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      },
    }),

  /**
   * GET /goods-receipts/summary — deliveries and value, per supplier.
   *
   * ONE REQUEST FOR A WHOLE PAGE of suppliers, which is the point: the same
   * numbers could be had by counting each vendor's receipts, but that is one
   * round trip per row and the totals would still be wrong, since a client can
   * only add up the page it was sent.
   *
   * Omit `supplierId` for every vendor (the list screen's column), pass one for
   * a single vendor (the detail screen's stats) — the shape is identical either
   * way, so both screens read it the same.
   */
  summary: (query: { supplierId?: string } = {}) =>
    apiClient.get<SupplierPurchaseSummary>("/goods-receipts/summary", {
      query: { supplierId: query.supplierId },
    }),
};
