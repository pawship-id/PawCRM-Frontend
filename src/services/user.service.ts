import { apiClient } from "./api-client";
import type {
  User,
  UpdateProfileInput,
  CreateUserInput,
  UpdateUserInput,
  UserListQuery,
  PageResult,
} from "@/types/api";

/**
 * Staff-user domain calls against /api/users.
 *
 * Every call maps one typed domain operation onto a single apiClient request
 * and nothing else — no React, no state. The tenant scope is derived from the
 * session cookie by the backend, so it is never passed here.
 *
 * Password (`changePassword`) and status (`setStatus`) have dedicated backend
 * routes and are intentionally NOT folded into `update`, mirroring the API.
 */
export const userService = {
  /**
   * GET /users — paginated, filterable list of staff users.
   *
   * Spread into a fresh object literal so it satisfies apiClient's
   * `Record<string, ...>` query type (a named interface does not); apiClient
   * drops the undefined entries when building the query string.
   */
  list: (query: UserListQuery = {}) =>
    apiClient.get<PageResult<User>>("/users", {
      query: {
        page: query.page,
        limit: query.limit,
        status: query.status,
        roleId: query.roleId,
        branchId: query.branchId,
        search: query.search,
        includeDeleted: query.includeDeleted,
      },
    }),

  /** GET /users/:id — a single staff user. */
  getById: (id: string) => apiClient.get<User>(`/users/${id}`),

  /** POST /users — create a staff user (201). */
  create: (input: CreateUserInput) => apiClient.post<User>("/users", input),

  /** PATCH /users/:id — update editable fields (send only what changed). */
  update: (id: string, patch: UpdateUserInput) =>
    apiClient.patch<User>(`/users/${id}`, patch),

  /**
   * PATCH /users/:id — update editable profile fields.
   *
   * The profile screen operates on the SIGNED-IN user, whose id comes from
   * /auth/me. Kept as a distinct, narrower call so that screen cannot touch
   * role or branch scope.
   */
  updateProfile: (id: string, patch: UpdateProfileInput) =>
    apiClient.patch<User>(`/users/${id}`, patch),

  /**
   * PATCH /users/:id/password — set a new password.
   *
   * The backend takes no current password on this route (it is the
   * administrative reset), so the UI does not collect one.
   */
  changePassword: (id: string, newPassword: string) =>
    apiClient.patch<{ updated: boolean }>(`/users/${id}/password`, {
      newPassword,
    }),

  /** PATCH /users/:id/status — activate or suspend a user. */
  setStatus: (id: string, status: User["status"]) =>
    apiClient.patch<User>(`/users/${id}/status`, { status }),

  /** PATCH /users/:id/unlock — clear a login lockout (no body). */
  unlock: (id: string) => apiClient.patch<User>(`/users/${id}/unlock`),

  /** DELETE /users/:id — soft delete. */
  remove: (id: string) =>
    apiClient.delete<{ deleted: boolean }>(`/users/${id}`),

  /** PATCH /users/:id/restore — undo a soft delete (may 409 if email reused). */
  restore: (id: string) => apiClient.patch<User>(`/users/${id}/restore`),
};
