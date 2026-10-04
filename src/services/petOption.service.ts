import { apiClient } from "./api-client";
import type {
  CreatePetOptionInput,
  PageResult,
  PetOption,
  PetOptionListQuery,
  UpdatePetOptionInput,
} from "@/types/api";

/**
 * Pet-option calls against /api/pet-options — the species, breeds, sizes and
 * coats a tenant describes its animals with. One collection on the backend,
 * told apart by `type`.
 *
 * Screens that only need the words should not call this directly: they read
 * `usePetOptions()` from the pets feature, which loads the list once and shares
 * it. This service is for that hook and for the settings screen that edits the
 * lists.
 */
export const petOptionService = {
  /** GET /pet-options — paginated; `limit` defaults to the API's ceiling of 100. */
  list: (query: PetOptionListQuery = {}) =>
    apiClient.get<PageResult<PetOption>>("/pet-options", {
      query: {
        page: query.page,
        limit: query.limit ?? 100,
        type: query.type,
        isActive: query.isActive,
        search: query.search,
        includeDeleted: query.includeDeleted,
      },
    }),

  /** POST /pet-options — 409 when the label (or an explicit code) is taken. */
  create: (input: CreatePetOptionInput) =>
    apiClient.post<PetOption>("/pet-options", input),

  /** PATCH /pet-options/:id — label, order, retired flag. Never the code. */
  update: (id: string, patch: UpdatePetOptionInput) =>
    apiClient.patch<PetOption>(`/pet-options/${id}`, patch),

  /**
   * DELETE /pet-options/:id — soft delete. A 409 while live pets or services
   * still store the code; its `reason` carries the counts, so read
   * `ApiError.fullMessage`.
   */
  remove: (id: string) => apiClient.delete<PetOption>(`/pet-options/${id}`),

  /** PATCH /pet-options/:id/restore — may 409 when the code or label was reused. */
  restore: (id: string) =>
    apiClient.patch<PetOption>(`/pet-options/${id}/restore`),
};
