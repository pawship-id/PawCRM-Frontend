import { apiClient } from "./api-client";
import type {
  PageResult,
  Warehouse,
  WarehouseListQuery,
  CreateWarehouseInput,
  UpdateWarehouseInput,
} from "@/types/api";

/**
 * Warehouse master-data calls against /api/warehouses — a tenant's physical
 * stock locations.
 *
 * One typed domain operation per apiClient request, no React and no state, like
 * every other service here. The tenant scope comes from the session cookie on
 * the backend, so it is never passed.
 *
 * `isActive` is an ordinary field edited through `update` (a warehouse that is
 * closed to movement but still owns its stock); the `deletedAt` lifecycle has
 * its own `remove`/`restore` routes, mirroring the API. `isDefault` has no
 * method at all: it is server-owned, and the backend strips it from any payload.
 */
export const warehouseService = {
  /**
   * GET /warehouses — paginated, filterable list.
   *
   * Defaults to `limit: 100` because the oldest caller is a picker
   * (useCatalogLookups) that wants the whole set in one page; the list screen
   * passes an explicit page size. Spread into a fresh object literal to satisfy
   * apiClient's `Record<string, ...>` query type — it drops the undefined
   * entries.
   */
  list: (query: WarehouseListQuery = {}) =>
    apiClient.get<PageResult<Warehouse>>("/warehouses", {
      query: {
        page: query.page,
        limit: query.limit ?? 100,
        isActive: query.isActive,
        defaultBranchId: query.defaultBranchId,
        search: query.search,
        includeDeleted: query.includeDeleted,
      },
    }),

  /** GET /warehouses/:id — a single warehouse. */
  getById: (id: string) => apiClient.get<Warehouse>(`/warehouses/${id}`),

  /** POST /warehouses — create a warehouse (201). */
  create: (input: CreateWarehouseInput) =>
    apiClient.post<Warehouse>("/warehouses", input),

  /** PATCH /warehouses/:id — update editable fields (send only what changed). */
  update: (id: string, patch: UpdateWarehouseInput) =>
    apiClient.patch<Warehouse>(`/warehouses/${id}`, patch),

  /**
   * DELETE /warehouses/:id — soft delete (returns the deleted warehouse).
   *
   * Refused with 409 when the warehouse is a branch's default or still holds
   * stock/history; the explanation arrives in ApiError.reason, so callers show
   * `fullMessage` rather than `message`.
   */
  remove: (id: string) => apiClient.delete<Warehouse>(`/warehouses/${id}`),

  /** PATCH /warehouses/:id/restore — undo a soft delete (may 409 on name clash). */
  restore: (id: string) => apiClient.patch<Warehouse>(`/warehouses/${id}/restore`),
};
