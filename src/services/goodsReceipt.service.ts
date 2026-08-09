import { apiClient } from "./api-client";
import type {
  CreateGoodsReceiptInput,
  GoodsReceiptDetail,
  GoodsReceiptListQuery,
  GoodsReceiptListRow,
  GoodsReceiptPreview,
  PageResult,
  SupplierPurchaseSummary,
} from "@/types/api";

/**
 * Goods receipts, against /api/goods-receipts.
 *
 * CREATE AND READ ONLY, and the absences are the backend's design rather than
 * this file's caution. There is no `update` and no `remove` here because there is
 * no `PATCH` and no `DELETE` there: a receipt posts stock movements and a journal
 * entry that are both immutable, and it sets the cost basis every later sale of
 * those goods is costed at. An edit would silently restate margins that have
 * already been reported; a delete would leave the ledger pointing at a document
 * nobody can look up. A delivery that was wrong is corrected by a PURCHASE
 * RETURN, which reverses at the original price and says so in the books.
 *
 * Mirrors supplierService: each method maps one typed domain operation onto a
 * single apiClient request — no React, no state. The tenant scope is derived from
 * the session cookie by the backend, so it is never passed here.
 */
export const goodsReceiptService = {
  /**
   * GET /goods-receipts — deliveries, newest first, filterable.
   *
   * `items` IS PROJECTED AWAY by the server and replaced with `itemCount`; read
   * one receipt to get its lines. The supplier detail screen passes `supplierId`
   * and a small `limit`: it shows the recent history, not the whole book, and the
   * count it displays comes from `summary` rather than from paging through this.
   *
   * `invoiced` IS A TRI-STATE and is passed through as one. Omitted means either;
   * `false` is how the file-an-invoice picker asks for deliveries still awaiting
   * the vendor's bill. It has to be a server filter — the API pages before a
   * client could filter, so a page-local `invoiceId === null` would hide rows the
   * pager had already counted.
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
        invoiced: query.invoiced,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      },
    }),

  /**
   * GET /goods-receipts/:id — one delivery, with its lines and their labels.
   *
   * 404s for another tenant's receipt exactly as for an unknown id, which is the
   * intended answer: a 403 would confirm the id exists.
   */
  getById: (id: string) =>
    apiClient.get<GoodsReceiptDetail>(`/goods-receipts/${id}`),

  /**
   * POST /goods-receipts — receive a delivery (201). THE IRREVERSIBLE ONE.
   *
   * Moves the stock, recomputes the weighted average cost, and — for a
   * `beli_putus` purchase — credits `2101 Utang Supplier`. All of it in one
   * transaction with the document itself.
   *
   * NOT IDEMPOTENT ACROSS REQUESTS, and callers must handle that themselves: a
   * double-submitted form creates TWO receipts, because a receipt *is* the
   * upstream document, so a retried submit is indistinguishable from a second
   * delivery of the same goods — which genuinely happens. Unlike
   * stockMovementService.createAdjustment there is no `idempotencyKey` to send.
   * ReceiptForm locks its submit button for the whole flight; `preview` is the
   * other half of the mitigation.
   */
  create: (input: CreateGoodsReceiptInput) =>
    apiClient.post<GoodsReceiptDetail>("/goods-receipts", input),

  /**
   * POST /goods-receipts/preview — what the receipt WOULD do, writing nothing.
   *
   * THE SAME BODY AS `create`, because it is the same request. A client that can
   * preview can trust that posting will not then be turned away for a reason the
   * preview never mentioned — so the two must never be sent different payloads.
   *
   * Gated on `goodsReceipts:create`, not `read`: it answers "what will this
   * delivery do to my cost basis and my books", and a role that may not receive
   * goods has no business asking.
   */
  preview: (input: CreateGoodsReceiptInput) =>
    apiClient.post<GoodsReceiptPreview>("/goods-receipts/preview", input),

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
