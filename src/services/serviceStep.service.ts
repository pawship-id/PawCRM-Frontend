import { apiClient } from "./api-client";
import type {
  CreateServiceStepInput,
  PageResult,
  ServiceStep,
  ServiceStepListQuery,
  UpdateServiceStepInput,
} from "@/types/api";

/**
 * Tahapan calls against /api/service-steps — one list per business line.
 *
 * Pickers read `useServiceSteps(businessLineId)` rather than calling this
 * directly: it loads a line's list once and shares it. This service is for that
 * hook, the quick-add on a service's Tahapan card, and the settings screen.
 */
export const serviceStepService = {
  /** GET /service-steps — paginated; `limit` defaults to the API's ceiling of 100. */
  list: (query: ServiceStepListQuery = {}) =>
    apiClient.get<PageResult<ServiceStep>>("/service-steps", {
      query: {
        page: query.page,
        limit: query.limit ?? 100,
        businessLineId: query.businessLineId,
        isActive: query.isActive,
        search: query.search,
        includeDeleted: query.includeDeleted,
      },
    }),

  /** POST /service-steps — 409 when the line already has the name. */
  create: (input: CreateServiceStepInput) =>
    apiClient.post<ServiceStep>("/service-steps", input),

  /**
   * PATCH /service-steps/:id — a rename also rewrites the line's services;
   * `renamedServiceCount` says how many.
   */
  update: (id: string, patch: UpdateServiceStepInput) =>
    apiClient.patch<ServiceStep>(`/service-steps/${id}`, patch),

  /**
   * DELETE /service-steps/:id — 409 while live services list it; the count is in
   * `reason`, so read `ApiError.fullMessage`.
   */
  remove: (id: string) => apiClient.delete<ServiceStep>(`/service-steps/${id}`),

  /** PATCH /service-steps/:id/restore — may 409 when the name was reused. */
  restore: (id: string) =>
    apiClient.patch<ServiceStep>(`/service-steps/${id}/restore`),
};
