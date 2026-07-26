import { apiClient } from "./api-client";
import type {
  Branch,
  BranchListQuery,
  CreateBranchInput,
  UpdateBranchInput,
  PageResult,
} from "@/types/api";

/**
 * Branch master-data calls against /api/branches.
 *
 * Every call maps one typed domain operation onto a single apiClient request —
 * no React, no state. The tenant scope is derived from the session cookie by the
 * backend, so it is never passed here. `isActive` is an ordinary field on the
 * branch (temporarily-closed axis), edited through `update`; the separate
 * `deletedAt` lifecycle has its own `remove`/`restore` routes, mirroring the API.
 */
export const branchService = {
  /**
   * GET /branches — paginated, filterable list of branches.
   *
   * Defaults to `limit: 100` so the user branch-scope picker (useLookups) pulls
   * the whole set in one page; the branch list screen passes an explicit page
   * size. Spread into a fresh object literal so it satisfies apiClient's
   * `Record<string, ...>` query type; apiClient drops the undefined entries.
   */
  list: (query: BranchListQuery = {}) =>
    apiClient.get<PageResult<Branch>>("/branches", {
      query: {
        page: query.page,
        limit: query.limit ?? 100,
        isActive: query.isActive,
        search: query.search,
        includeDeleted: query.includeDeleted,
      },
    }),

  /** GET /branches/:id — a single branch. */
  getById: (id: string) => apiClient.get<Branch>(`/branches/${id}`),

  /** POST /branches — create a branch (201). */
  create: (input: CreateBranchInput) =>
    apiClient.post<Branch>("/branches", input),

  /** PATCH /branches/:id — update editable fields (send only what changed). */
  update: (id: string, patch: UpdateBranchInput) =>
    apiClient.patch<Branch>(`/branches/${id}`, patch),

  /** DELETE /branches/:id — soft delete (returns the deleted branch). */
  remove: (id: string) => apiClient.delete<Branch>(`/branches/${id}`),

  /** PATCH /branches/:id/restore — undo a soft delete (may 409 on name clash). */
  restore: (id: string) => apiClient.patch<Branch>(`/branches/${id}/restore`),
};
