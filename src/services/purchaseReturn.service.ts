import { apiClient } from "./api-client";
import type {
  PageResult,
  PurchaseReturnListQuery,
  PurchaseReturnListRow,
} from "@/types/api";

/**
 * Purchase returns, against /api/purchase-returns.
 *
 * READ-ONLY HERE, AND NARROWER THAN THE API ON PURPOSE. The endpoint supports
 * create, update, preview, submit and delete; none of those are wrapped, because
 * the screens that return goods still run on the prototype store. Wrapping the
 * writes before those screens are converted would put two ways to return goods
 * in the codebase at once — the exact mistake this module's own goods-receipt
 * sibling avoided until its screens were ready.
 *
 * WHAT IS WRAPPED IS ONE QUESTION the goods-receipt detail screen has to answer:
 * "has this delivery already been sent back, and how much of it?" A receipt
 * cannot be edited or deleted, so a return is the ONLY thing that can change what
 * a posted delivery means — and a detail screen that cannot say so invites
 * somebody to return the same goods twice.
 */
export const purchaseReturnService = {
  /**
   * GET /purchase-returns — returns, newest first, filterable.
   *
   * `originalReceiptId` is the filter this file exists for. `items` is projected
   * away by the server and replaced with `itemCount`, as on the receipt list.
   */
  list: (query: PurchaseReturnListQuery = {}) =>
    apiClient.get<PageResult<PurchaseReturnListRow>>("/purchase-returns", {
      query: {
        page: query.page,
        limit: query.limit,
        search: query.search,
        supplierId: query.supplierId,
        warehouseId: query.warehouseId,
        originalReceiptId: query.originalReceiptId,
        status: query.status,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      },
    }),
};
