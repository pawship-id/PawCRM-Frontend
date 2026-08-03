import { apiClient } from "./api-client";
import type { PageResult } from "@/types/api";
import type {
  CreatedProduct,
  CreateProductInput,
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
 *  2. `list` TAKES TWO MUTUALLY EXCLUSIVE FILTERS. `excludeVariants` and
 *     `productType` select rows the same way and the backend rejects the pair
 *     with a 400. Callers send one or the other.
 *
 * Money and quantities are decimal STRINGS in both directions. Nothing here
 * parses them — see types/inventory.ts.
 */
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
        includeDeleted: query.includeDeleted,
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
  lowStock: (query: { page?: number; limit?: number; warehouseId?: string } = {}) =>
    apiClient.get<PageResult<Product & { qtyOnHand: string }>>(
      "/products/low-stock",
      { query: { ...query } },
    ),

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
