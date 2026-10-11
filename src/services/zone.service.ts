import { apiClient } from "./api-client";
import type {
  CreateZoneInput,
  PageResult,
  UpdateZoneInput,
  Zone,
  ZoneListQuery,
} from "@/types/api";

/**
 * Zona calls against /api/zones — the tenant's antar-jemput distance bands.
 *
 * A write that would overlap another zone, or reuse its name, is a 409 whose
 * `reason` names the zone hit; read `ApiError.fullMessage`.
 */
export const zoneService = {
  /** GET /zones — nearest first; `limit` defaults to the API's ceiling of 100. */
  list: (query: ZoneListQuery = {}) =>
    apiClient.get<PageResult<Zone>>("/zones", {
      query: {
        page: query.page,
        limit: query.limit ?? 100,
        search: query.search,
        includeDeleted: query.includeDeleted,
      },
    }),

  create: (input: CreateZoneInput) => apiClient.post<Zone>("/zones", input),

  update: (id: string, patch: UpdateZoneInput) =>
    apiClient.patch<Zone>(`/zones/${id}`, patch),

  /** DELETE /zones/:id — soft delete. */
  remove: (id: string) => apiClient.delete<Zone>(`/zones/${id}`),

  /**
   * POST /zones/measure — how far each pair is BY ROAD, as the server will
   * store it (11 October 2026). `source` is "straight" when the server fell
   * back to the crow's line. Up to 20 pairs a call.
   */
  measure: (pairs: Array<{ from: { lat: number; lng: number }; to: { lat: number; lng: number } }>) =>
    apiClient.post<Array<{ distanceKm: number | null; source: "road" | "straight" }>>(
      "/zones/measure",
      { pairs },
    ),

  /** PATCH /zones/:id/restore — 409 when its name or distances were taken meanwhile. */
  restore: (id: string) => apiClient.patch<Zone>(`/zones/${id}/restore`),
};
