import { apiClient } from "./api-client";
import type {
  Role,
  RoleListQuery,
  CreateRoleInput,
  UpdateRoleInput,
  PermissionCatalog,
  PageResult,
} from "@/types/api";

/**
 * Role (RBAC) domain calls against /api/roles.
 *
 * Every call maps one typed domain operation onto a single apiClient request —
 * no React, no state. The tenant scope is derived from the session cookie by the
 * backend, so it is never passed here. `isSystem`/`isSuperAdmin` are server-owned
 * and never sent; the backend strips them from any create/update payload.
 *
 * `list` keeps its lightweight `limit: 100` lookup shape for the user screens'
 * role picker (useLookups), while accepting the full query the roles master-data
 * list drives; the role list screen passes its own page size.
 */
export const roleService = {
  /**
   * GET /roles — paginated, filterable list of roles.
   *
   * Spread into a fresh object literal so it satisfies apiClient's
   * `Record<string, ...>` query type; apiClient drops the undefined entries when
   * building the query string. Defaults to `limit: 100` so the user role picker
   * pulls the whole (small) set in one page.
   */
  list: (query: RoleListQuery = {}) =>
    apiClient.get<PageResult<Role>>("/roles", {
      query: {
        page: query.page,
        limit: query.limit ?? 100,
        isSystem: query.isSystem,
        isSuperAdmin: query.isSuperAdmin,
        search: query.search,
        includeDeleted: query.includeDeleted,
      },
    }),

  /**
   * GET /roles/catalog — the RBAC permission catalog (features + actions).
   *
   * Tenant-agnostic and rarely changing; the permissions editor fetches it once
   * to render its feature × action matrix. Registered before /roles/:id on the
   * backend so "catalog" is not read as an id.
   */
  catalog: () => apiClient.get<PermissionCatalog>("/roles/catalog"),

  /** GET /roles/:id — a single role. */
  getById: (id: string) => apiClient.get<Role>(`/roles/${id}`),

  /** POST /roles — create a role (201). */
  create: (input: CreateRoleInput) => apiClient.post<Role>("/roles", input),

  /** PATCH /roles/:id — update editable fields (send only what changed). */
  update: (id: string, patch: UpdateRoleInput) =>
    apiClient.patch<Role>(`/roles/${id}`, patch),

  /**
   * DELETE /roles/:id — soft delete (returns the deleted role).
   *
   * Refused by the backend for system roles (403) and for roles still assigned
   * to a user (409); both surface as ApiError for the caller to show.
   */
  remove: (id: string) => apiClient.delete<Role>(`/roles/${id}`),

  /** PATCH /roles/:id/restore — undo a soft delete (may 409 on name clash). */
  restore: (id: string) => apiClient.patch<Role>(`/roles/${id}/restore`),
};
