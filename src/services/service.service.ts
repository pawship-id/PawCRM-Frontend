import { apiClient } from "./api-client";
import type {
  Service,
  ServiceListQuery,
  CreateServiceInput,
  UpdateServiceInput,
  PageResult,
} from "@/types/api";

/**
 * Service-catalogue calls against /api/services — what a tenant sells the DOING
 * of, as opposed to what it hands over.
 *
 * Mirrors productService in shape and petService in size: each method maps one
 * typed domain operation onto a single apiClient request. The tenant scope is
 * derived from the session cookie by the backend, so it is never passed here.
 *
 * PRICES CROSS THE WIRE AS STRINGS in both directions. The API refuses a numeric
 * one with a 400, and this file does no parsing on the way back — a component
 * that needs to display a price formats the string, and one that needs to do
 * arithmetic on it has a bug worth noticing rather than papering over.
 */
export const serviceService = {
  /**
   * GET /services — paginated, filterable list, **sorted by name** by the server.
   *
   * The sort is not a parameter: a catalogue is read as a menu, and every caller
   * wants it alphabetical. Spread into a fresh object literal so it satisfies
   * apiClient's query type; apiClient drops the undefined entries.
   *
   * ⚠️ EVERY FILTER MUST BE LISTED HERE BY HAND, and one that is not is dropped
   * in SILENCE — the request simply goes out unfiltered and the screen shows
   * everything. `serviceType` was added to the type, to the add-on picker and to
   * the API and forgotten here, so the picker offered every service in the
   * catalogue as an add-on. `service.service.test.ts` now holds a
   * `Required<ServiceListQuery>` that breaks at compile time when a field is
   * added and at run time until it is forwarded.
   */
  list: (query: ServiceListQuery = {}) =>
    apiClient.get<PageResult<Service>>("/services", {
      query: {
        page: query.page,
        limit: query.limit,
        businessLineId: query.businessLineId,
        categoryId: query.categoryId,
        serviceType: query.serviceType,
        branchId: query.branchId,
        isActive: query.isActive,
        search: query.search,
        includeDeleted: query.includeDeleted,
      },
    }),

  /** GET /services/:id — a single service. */
  getById: (id: string) => apiClient.get<Service>(`/services/${id}`),

  /** POST /services — create a service (201). May 409 on a duplicate code. */
  create: (input: CreateServiceInput) =>
    apiClient.post<Service>("/services", input),

  /** PATCH /services/:id — update editable fields (send only what changed). */
  update: (id: string, patch: UpdateServiceInput) =>
    apiClient.patch<Service>(`/services/${id}`, patch),

  /**
   * DELETE /services/:id — soft delete.
   *
   * May 409 while a live bundle still lists this service; the count of what is in
   * the way is in the error's `reason`, not its `message`.
   */
  remove: (id: string) => apiClient.delete<Service>(`/services/${id}`),

  /** PATCH /services/:id/restore — undo a soft delete (may 409 on a code clash). */
  restore: (id: string) => apiClient.patch<Service>(`/services/${id}/restore`),
};
