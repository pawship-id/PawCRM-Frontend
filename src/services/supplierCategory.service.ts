import { apiClient } from "./api-client";
import type {
  SupplierCategory,
  SupplierCategoryListQuery,
  CreateSupplierCategoryInput,
  UpdateSupplierCategoryInput,
  PageResult,
} from "@/types/api";

/**
 * Supplier-category calls against /api/supplier-categories.
 *
 * One typed domain operation per apiClient request — no React, no state,
 * mirroring category.service.ts. The tenant scope comes from the session cookie
 * on the backend, so it is never passed here.
 *
 * A SEPARATE SERVICE FROM category.service.ts, THOUGH BOTH READ THE SAME
 * COLLECTION on the backend. The two kinds share storage, not an API: this
 * resource takes a name and a switch, where a product category takes a parent,
 * a description and a picture. Routing both through one service with a `kind`
 * argument would give every product screen a parameter it must not get wrong,
 * and the failure would be silent — a vendor group appearing in a product
 * picker looks like data entry, not like a bug.
 *
 * `kind` is not sent on create: the API refuses it outright here (it has never
 * accepted one) and stamps "supplier" itself.
 *
 * Deleting is a SOFT delete with its own restore route, the same lifecycle
 * product categories have — the name is freed for reuse the moment it is
 * deleted, which is why `restore` can come back 409.
 */
export const supplierCategoryService = {
  /**
   * GET /supplier-categories — paginated, searchable list.
   *
   * Defaults to `limit: 100` for the same reason categoryService does: a picker
   * that groups a supplier wants the whole set in one page, while the list
   * screen passes an explicit page size.
   */
  list: (query: SupplierCategoryListQuery = {}) =>
    apiClient.get<PageResult<SupplierCategory>>("/supplier-categories", {
      query: {
        page: query.page,
        limit: query.limit ?? 100,
        search: query.search,
        isActive: query.isActive,
        includeDeleted: query.includeDeleted,
        sort: query.sort,
      },
    }),

  /** GET /supplier-categories/:id — a single category. */
  getById: (id: string) =>
    apiClient.get<SupplierCategory>(`/supplier-categories/${id}`),

  /** POST /supplier-categories — create (201). May 409 when the name is taken. */
  create: (input: CreateSupplierCategoryInput) =>
    apiClient.post<SupplierCategory>("/supplier-categories", input),

  /** PATCH /supplier-categories/:id — rename or retire. May 409 on the name. */
  update: (id: string, patch: UpdateSupplierCategoryInput) =>
    apiClient.patch<SupplierCategory>(`/supplier-categories/${id}`, patch),

  /**
   * DELETE /supplier-categories/:id — soft delete.
   *
   * UNGUARDED TODAY, unlike a product category's: nothing references a supplier
   * category yet, so there is no "still in use" refusal to handle. When
   * suppliers gain a category reference the backend will start answering 409
   * here, and the confirm copy is where that has to be reflected.
   */
  remove: (id: string) =>
    apiClient.delete<SupplierCategory>(`/supplier-categories/${id}`),

  /** PATCH /supplier-categories/:id/restore — undo a soft delete (may 409). */
  restore: (id: string) =>
    apiClient.patch<SupplierCategory>(`/supplier-categories/${id}/restore`),
};
