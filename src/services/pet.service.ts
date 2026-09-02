import { apiClient } from "./api-client";
import type {
  Pet,
  PetListQuery,
  PetTimeline,
  PetTimelineQuery,
  UpdatePetMedicalInput,
  UpdatePetPreferencesInput,
  CreatePetInput,
  UpdatePetInput,
  PageResult,
} from "@/types/api";

/**
 * Pet master-data calls against /api/pets.
 *
 * Mirrors customerService: each method maps one typed domain operation onto a
 * single apiClient request — no React, no state. The tenant scope is derived
 * from the session cookie by the backend, so it is never passed here.
 *
 * A pet has TWO lifecycle axes where a customer has one: `isActive` (still in
 * the tenant's care) is edited through `update`, while the soft-delete
 * `deletedAt` is edited through `remove` / `restore`.
 */
export const petService = {
  /**
   * GET /pets — paginated, filterable list.
   *
   * `customerId` is the filter this endpoint exists for: the customer detail
   * screen and the POS Booking Bridge both ask "which animals does this person
   * have". Spread into a fresh object literal so it satisfies apiClient's query
   * type; apiClient drops the undefined entries.
   */
  list: (query: PetListQuery = {}) =>
    apiClient.get<PageResult<Pet>>("/pets", {
      query: {
        page: query.page,
        limit: query.limit,
        customerId: query.customerId,
        species: query.species,
        isActive: query.isActive,
        search: query.search,
        tag: query.tag,
        includeDeleted: query.includeDeleted,
      },
    }),

  /** GET /pets/:id — a single pet. */
  getById: (id: string) => apiClient.get<Pet>(`/pets/${id}`),

  /** POST /pets — register a pet (201). */
  create: (input: CreatePetInput) => apiClient.post<Pet>("/pets", input),

  /** PATCH /pets/:id — update editable fields (send only what changed). */
  update: (id: string, patch: UpdatePetInput) =>
    apiClient.patch<Pet>(`/pets/${id}`, patch),

  /** DELETE /pets/:id — soft delete (returns the deleted pet). */
  remove: (id: string) => apiClient.delete<Pet>(`/pets/${id}`),

  /**
   * PATCH /pets/:id/restore — undo a soft delete.
   *
   * May 409 when the OWNER has since been deleted: deleting a pet frees its
   * customer to be deleted too, and restoring an orphan is what the required
   * `customerId` exists to prevent.
   */
  restore: (id: string) => apiClient.patch<Pet>(`/pets/${id}/restore`),

  /* ── FR-5: the profile ─────────────────────────────────────────────────── */

  /**
   * GET /pets/tags — every tag the tenant already uses.
   *
   * A BARE ARRAY, not a page: the answer is a handful of short strings a
   * combobox renders whole. It is the vocabulary, curated by use — the form
   * offers what is already there so `galak` gets typed once and picked
   * thereafter, which is what keeps the filter finding everything.
   */
  tags: () => apiClient.get<string[]>("/pets/tags"),

  /** GET /pets/:id/timeline — everything this animal has ever had done. */
  timeline: (id: string, query: PetTimelineQuery = {}) =>
    apiClient.get<PetTimeline>(`/pets/${id}/timeline`, {
      query: {
        kind: query.kind,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      },
    }),

  /** PATCH /pets/:id/preferences — how the shop handles this animal. */
  updatePreferences: (id: string, input: UpdatePetPreferencesInput) =>
    apiClient.patch<Pet>(`/pets/${id}/preferences`, input),

  /**
   * PATCH /pets/:id/medical — the whole file, every time.
   *
   * ITS OWN GRANT (`pets:medical`), separate from `update`: a groomer may write
   * "mandi duluan" without being able to drop a medication somebody's vet
   * dictated. A 403 here is that rule, not a bug.
   */
  updateMedical: (id: string, input: UpdatePetMedicalInput) =>
    apiClient.patch<Pet>(`/pets/${id}/medical`, input),
};
