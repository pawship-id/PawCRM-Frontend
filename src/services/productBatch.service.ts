import { apiClient } from "./api-client";
import type {
  ConsignmentProductsResult,
  PageResult,
  SupplierConsignmentSummary,
} from "@/types/api";
import type {
  BatchExpirySummary,
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
 * The list arrives sorted closest-to-expiring first — with the lots that have NO
 * expiry last, which is the API's own ordering and not something to re-derive: a
 * client paging server-side could not reorder across pages anyway. What callers
 * DO reorder is live-before-exhausted, which is a display choice rather than a
 * correction.
 *
 * EVERY ROW CARRIES ITS LABELS. `productName`, `productSku`, `productUnit` and
 * `warehouseName` come back alongside the ids, because this collection is read
 * ACROSS products and warehouses — a client would otherwise need the whole
 * catalogue in memory to render one row.
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
        branchId: query.branchId,
        hasRemaining: query.hasRemaining,
        search: query.search,
        expiryFrom: query.expiryFrom,
        expiryTo: query.expiryTo,
        sort: query.sort,
      },
    }),

  /**
   * GET /product-batches/summary — how many lots sit in each expiry bucket, and
   * what they are worth.
   *
   * MUTUALLY EXCLUSIVE buckets, unlike `expiring` below, which is cumulative: a
   * list leads with the most urgent rows, tiles sit side by side and must not
   * count the same lot twice. `atRisk` is the other three added up.
   *
   * The `value` of each bucket is the reason this is a request rather than a
   * calculation — summing `qtyRemaining × costPerUnit` needs every row, and
   * summing the page on screen would report a figure that grows as the user
   * pages.
   */
  summary: (query: { warehouseId?: string; branchId?: string } = {}) =>
    apiClient.get<BatchExpirySummary>("/product-batches/summary", {
      // The same pair the list takes, and it has to be: tiles that counted a
      // wider set than the rows under them would be a total nobody can
      // reconcile against what is on screen.
      query: { warehouseId: query.warehouseId, branchId: query.branchId },
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
        branchId: query.branchId,
        withinDays: query.withinDays,
        sort: query.sort,
      },
    }),

  /**
   * GET /product-batches/consignment-summary — consigned stock still held, per
   * supplier.
   *
   * THE ONE REPORT THAT SEPARATES CONSIGNED FROM OWNED STOCK. A consigned lot is
   * indistinguishable from owned stock everywhere else, because physically it is
   * — it sits on the same shelf and counts in the same stock take. What makes it
   * different is that it belongs to the supplier until it sells, and this is the
   * only place that difference is reportable.
   *
   * NOT A DEBT: nothing here is owed yet. Read alongside
   * `purchaseInvoiceService.outstandingSummary`, which is what IS owed.
   */
  consignmentSummary: (query: { supplierId?: string } = {}) =>
    apiClient.get<SupplierConsignmentSummary>(
      "/product-batches/consignment-summary",
      { query: { supplierId: query.supplierId } },
    ),

  /**
   * GET /product-batches/consignment-products — the same stock, per product.
   *
   * The question that follows `consignmentSummary` every time: it reports how
   * MANY of a vendor's products are still here, this reports WHICH. A supplier
   * phoning about their goods is not asking for a count.
   *
   * Same filter shape as the summary on purpose, so a screen drilling from one
   * to the other passes its `supplierId` straight through.
   */
  consignmentProducts: (query: { supplierId?: string } = {}) =>
    apiClient.get<ConsignmentProductsResult>(
      "/product-batches/consignment-products",
      { query: { supplierId: query.supplierId } },
    ),

  /** GET /product-batches/:id — one lot. */
  getById: (id: string) =>
    apiClient.get<ProductBatch>(`/product-batches/${id}`),
};
