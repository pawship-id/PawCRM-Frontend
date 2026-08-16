import { apiClient } from "./api-client";
import type {
  Category,
  CategoryListQuery,
  CreateCategoryInput,
  UpdateCategoryInput,
  PageResult,
} from "@/types/api";

/**
 * Product-category calls against /api/categories.
 *
 * One typed domain operation per apiClient request — no React, no state,
 * mirroring branch.service.ts. The tenant scope comes from the session cookie
 * on the backend, so it is never passed here.
 *
 * `kind` is not sent on create: the API defaults it to "product", and the
 * frontend has no other kind to offer (see CategoryKind). Passing it would be a
 * value the UI cannot vary pretending to be a choice.
 *
 * Deleting is a SOFT delete with its own restore route, the same lifecycle
 * branches have — a category name is freed for reuse the moment it is deleted,
 * which is why `restore` can come back 409.
 */
export const categoryService = {
  /**
   * GET /categories — paginated, searchable list.
   *
   * Defaults to `limit: 100` for the same reason branchService does: a picker
   * that fills a product form wants the whole set in one page, while the list
   * screen passes an explicit page size.
   */
  list: (query: CategoryListQuery = {}) =>
    apiClient.get<PageResult<Category>>("/categories", {
      query: {
        page: query.page,
        limit: query.limit ?? 100,
        kind: query.kind,
        search: query.search,
        isActive: query.isActive,
        includeDeleted: query.includeDeleted,
        sort: query.sort,
      },
    }),

  /** GET /categories/:id — a single category. */
  getById: (id: string) => apiClient.get<Category>(`/categories/${id}`),

  /** POST /categories — create (201). May 409 when the name is taken. */
  create: (input: CreateCategoryInput) =>
    apiClient.post<Category>("/categories", input),

  /** PATCH /categories/:id — rename. May 409 when the new name is taken. */
  update: (id: string, patch: UpdateCategoryInput) =>
    apiClient.patch<Category>(`/categories/${id}`, patch),

  /**
   * DELETE /categories/:id — soft delete.
   *
   * Refused with a 409 while any live product is still filed under it; the
   * message names how many, because "move them first" is useless without
   * knowing how much is in the way.
   */
  remove: (id: string) => apiClient.delete<Category>(`/categories/${id}`),

  /** PATCH /categories/:id/restore — undo a soft delete (may 409 on name clash). */
  restore: (id: string) => apiClient.patch<Category>(`/categories/${id}/restore`),
};
