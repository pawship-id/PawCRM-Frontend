import { apiClient } from "./api-client";
import type { PageResult } from "@/types/api";
import type {
  CreatedProduct,
  CreateProductInput,
  NegativeStockResult,
  Product,
  ProductListQuery,
  ProductVariantsResult,
  UpdateProductInput,
} from "@/types/inventory";

/**
 * Catalogue calls against /api/products.
 *
 * Mirrors customerService: one typed domain operation per method, each mapping
 * onto a single apiClient request — no React, no state. The tenant scope comes
 * from the session cookie, so it is never passed here.
 *
 * TWO THINGS ABOUT THIS RESOURCE ARE NOT LIKE THE MASTER-DATA SERVICES:
 *
 *  1. `create` MAY WRITE MORE THAN ONE DOCUMENT. A parent payload carrying
 *     `variants[]` creates the whole family in one transaction, and the response
 *     carries them back in `variants`. It may also post opening stock, reported
 *     in `openingStock` — see CreatedProduct.
 *  2. `list` TAKES THREE MUTUALLY EXCLUSIVE FILTERS. `excludeVariants`,
 *     `productType` and `holdsStock` all select rows by type, and the backend
 *     rejects any pair of them with a 400. Callers send exactly one.
 *
 * Money and quantities are decimal STRINGS in both directions. Nothing here
 * parses them — see types/inventory.ts.
 */
/**
 * One opening-stock sheet: a warehouse, and a line per product.
 *
 * ONE WAREHOUSE FOR THE WHOLE SHEET rather than one per line — an opening count
 * is done by walking a building, and a field repeated identically on sixty
 * lines is sixty chances to get one of them wrong.
 *
 * `costPerUnit` is REQUIRED, unlike on an adjustment. Without it the ledger
 * values the arrival at the product's running average, which for something that
 * has never moved is zero: quantity on the shelf and nothing in the asset.
 */
export interface OpeningStockInput {
  warehouseId: string;
  lines: Array<{
    productId: string;
    qty: string;
    costPerUnit: string;
    batchCode?: string;
    expiryDate?: string;
    isConsignment?: boolean;
  }>;
}

export const productService = {
  /**
   * GET /products — paginated, filterable catalogue.
   *
   * Spread into a fresh object literal so it satisfies apiClient's query type;
   * apiClient drops the undefined entries, so an unset filter is not sent.
   */
  list: (query: ProductListQuery = {}) =>
    apiClient.get<PageResult<Product>>("/products", {
      query: {
        page: query.page,
        limit: query.limit,
        search: query.search,
        categoryId: query.categoryId,
        productType: query.productType,
        parentId: query.parentId,
        isActive: query.isActive,
        excludeVariants: query.excludeVariants,
        holdsStock: query.holdsStock,
        isConsignment: query.isConsignment,
        neverMovedInWarehouse: query.neverMovedInWarehouse,
        inStockAtWarehouse: query.inStockAtWarehouse,
        includeDeleted: query.includeDeleted,
        sort: query.sort,
      },
    }),

  /** GET /products/:id — a single product. */
  getById: (id: string) => apiClient.get<Product>(`/products/${id}`),

  /**
   * GET /products/:id/variants — one parent's variants, unpaginated.
   *
   * Returns `{ parent, items }`: a caller expanding a row already has the
   * parent, but a caller arriving by id (the edit screen) needs both.
   */
  listVariants: (parentId: string, includeDeleted = false) =>
    apiClient.get<ProductVariantsResult>(`/products/${parentId}/variants`, {
      query: { includeDeleted: includeDeleted || undefined },
    }),

  /** GET /products/barcode/:barcode — the scanner's exact-match lookup. */
  getByBarcode: (barcode: string) =>
    apiClient.get<Product>(`/products/barcode/${encodeURIComponent(barcode)}`),

  /** GET /products/low-stock — at or below the restock threshold. */
  lowStock: (
    query: { page?: number; limit?: number; warehouseId?: string } = {},
  ) =>
    apiClient.get<PageResult<Product & { qtyOnHand: string }>>(
      "/products/low-stock",
      { query: { ...query } },
    ),

  /**
   * GET /products/negative-stock — the shelves that owe what they have already
   * sold.
   *
   * A DIFFERENT LIST FROM `lowStock`, not the same one with another threshold.
   * That one is one row per PRODUCT (the restock threshold is a property of the
   * product, so quantities sum across warehouses); this is one row per product
   * AT ONE WAREHOUSE, because a shortfall is a discrepancy at a place and
   * "you are three short somewhere" is not something anybody can act on.
   *
   * `shortfall` is the whole hole across every shelf in scope, NOT the page's
   * worth of it — a card that summed its five rows would read as the answer
   * while being a fraction of it. Negative, like every `value` here.
   */
  negativeStock: (
    query: { page?: number; limit?: number; warehouseId?: string } = {},
  ) =>
    apiClient.get<NegativeStockResult>("/products/negative-stock", {
      query: { ...query },
    }),

  /**
   * POST /products/opening-stock — the opening balance of products that were
   * registered without one (201).
   *
   * SEPARATE FROM AN ADJUSTMENT, and the account is the whole reason: this
   * posts `opening_balance`, which credits 3101 Modal / Saldo Awal. A manual
   * adjustment credits 5201 Kerugian Persediaan, which is right for goods that
   * vanished and absurd for a shop's day-one inventory.
   *
   * REFUSED FOR ANY PRODUCT THAT HAS EVER MOVED, by SKU, in one answer. The
   * server owns that rule — the ledger is where the answer lives — so a client
   * cannot pre-empt it and should surface the message rather than paraphrase
   * it: it names the products to take off the sheet.
   */
  addOpeningStock: (input: OpeningStockInput) =>
    apiClient.post<{ movements: unknown[] }>("/products/opening-stock", input),

  /** POST /products — create (201). May carry a family and opening stock. */
  create: (input: CreateProductInput) =>
    apiClient.post<CreatedProduct>("/products", input),

  /** PATCH /products/:id — update editable fields (send only what changed). */
  update: (id: string, patch: UpdateProductInput) =>
    apiClient.patch<Product>(`/products/${id}`, patch),

  /**
   * DELETE /products/:id — soft delete.
   *
   * Guarded by the backend three ways, each a 409 with the count: a parent with
   * live variants, a product a live bundle consumes, and a product still holding
   * stock. Callers surface the message rather than translating it — it names
   * which guard refused and what to do instead.
   */
  remove: (id: string) => apiClient.delete<Product>(`/products/${id}`),

  /** PATCH /products/:id/restore — undo a soft delete (409 if a code was taken). */
  restore: (id: string) => apiClient.patch<Product>(`/products/${id}/restore`),
};
