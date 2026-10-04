import { apiClient } from "./api-client";
import type {
  CreateServiceStepInput,
  PageResult,
  ServiceStep,
  ServiceStepListQuery,
  UpdateServiceStepInput,
} from "@/types/api";

/**
 * Tahapan calls against /api/service-steps — ONE LIST PER TENANT (22 Sep 2026).
 *
 * Pickers read `useServiceSteps()` rather than calling this directly: it loads
 * the list once and shares it. This service is for that
 * hook, the quick-add on a service's Tahapan card, and the settings screen.
 */
export const serviceStepService = {
  /** GET /service-steps — paginated; `limit` defaults to the API's ceiling of 100. */
  list: (query: ServiceStepListQuery = {}) =>
    apiClient.get<PageResult<ServiceStep>>("/service-steps", {
      query: {
        page: query.page,
        limit: query.limit ?? 100,
        isActive: query.isActive,
        search: query.search,
        includeDeleted: query.includeDeleted,
      },
    }),

  /** POST /service-steps — 409 when the list already has the name. */
  create: (input: CreateServiceStepInput) =>
    apiClient.post<ServiceStep>("/service-steps", input),

  /**
   * PATCH /service-steps/:id — a rename also rewrites every service listing it;
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
