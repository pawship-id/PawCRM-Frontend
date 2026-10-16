import { apiClient } from "./api-client";
import type {
  CreateGoodsReceiptInput,
  GoodsReceiptDetail,
  GoodsReceiptListQuery,
  GoodsReceiptListRow,
  GoodsReceiptPreview,
  PageResult,
  PurchaseActivityEntry,
  ReceiptFromInvoiceItemInput,
  ReceiveGoodsReceiptInput,
  SupplierPurchaseSummary,
} from "@/types/api";

/**
 * Goods receipts, against /api/goods-receipts.
 *
 * NO EDIT AND NO DELETE — after filing, the only writes are receiving, closing,
 * and making a receipt from an invoice — and the absences are the backend's design rather than
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
        branchId: query.branchId,
        purchaseType: query.purchaseType,
        status: query.status,
        invoiced: query.invoiced,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        sort: query.sort,
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
   * POST /goods-receipts — FILE a delivery as `pending` (201). Posts nothing;
   * stock, HPP and the payable move as lines are received (`receive`). With
   * `invoice`, the supplier's bill is filed in the same save, lines copied.
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
   * POST /goods-receipts/:id/receive — one receiving event. `lines` states each
   * line's NEW TOTAL received quantity (lower = a correction, allowed while
   * partial); omitted, everything is received in full. Posts only the
   * difference: stock, HPP and — for beli putus — the payable.
   */
  receive: (id: string, input: ReceiveGoodsReceiptInput = {}) =>
    apiClient.post<GoodsReceiptDetail>(`/goods-receipts/${id}/receive`, input),

  /** Closes a partly received delivery short; a linked invoice is billed down. */
  close: (id: string, input: { notes?: string } = {}) =>
    apiClient.post<GoodsReceiptDetail>(`/goods-receipts/${id}/close`, input),

  /**
   * Makes a receipt from a manual supplier invoice, from the invoice lines the
   * clerk PICKED — at least one; a line may be picked once per batch.
   */
  createFromInvoice: (
    invoiceId: string,
    input: {
      receiptDate?: string;
      notes?: string;
      items: ReceiptFromInvoiceItemInput[];
    },
  ) =>
    apiClient.post<GoodsReceiptDetail>(
      `/goods-receipts/from-invoice/${invoiceId}`,
      input,
    ),

  /** The receipt's history merged with its invoice's, newest first. */
  activity: (id: string) =>
    apiClient.get<{ items: PurchaseActivityEntry[] }>(
      `/goods-receipts/${id}/activity`,
    ),

  /** Deliveries still expected (pending or partial), optionally per cabang. */
  pendingCount: (query: { branchId?: string; branchIds?: string[] } = {}) =>
    apiClient.get<{ count: number }>("/goods-receipts/pending-count", {
      query: {
        branchId: query.branchId || undefined,
        branchIds: query.branchIds,
      },
    }),

  /**
   * POST /goods-receipts/preview — what the receipt WOULD do, writing nothing.
   * THE SAME BODY AS `create`, because it is the same request. Gated on
   * `goodsReceipts:create`, not `read`.
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
