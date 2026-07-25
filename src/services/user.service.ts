import { apiClient } from "./api-client";
import type { User, UpdateProfileInput } from "@/types/api";

/**
 * Staff-user domain calls against /api/users.
 *
 * The profile screen operates on the SIGNED-IN user, whose id comes from
 * /auth/me — the tenant scope is derived from the session cookie by the
 * backend, never passed here.
 */
export const userService = {
  /** PATCH /users/:id — update editable profile fields. */
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
};
