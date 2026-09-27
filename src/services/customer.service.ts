import { apiClient } from "./api-client";
import type {
  Customer,
  CustomerListQuery,
  CustomerStats,
  DormantCustomerList,
  CreateCustomerInput,
  UpdateCustomerInput,
  PageResult,
} from "@/types/api";

/**
 * Customer master-data calls against /api/customers.
 *
 * Mirrors branchService: each method maps one typed domain operation onto a
 * single apiClient request — no React, no state. The tenant scope is derived
 * from the session cookie by the backend, so it is never passed here. A customer
 * has no `isActive` axis (unlike a branch); its only lifecycle is the soft-delete
 * `deletedAt`, edited through the `remove`/`restore` routes.
 */
export const customerService = {
  /**
   * GET /customers — paginated, filterable list of customers.
   *
   * `limit` defaults to the backend's own default when omitted; the list screen
   * passes an explicit page size. Spread into a fresh object literal so it
   * satisfies apiClient's query type; apiClient drops the undefined entries.
   */
  list: (query: CustomerListQuery = {}) =>
    apiClient.get<PageResult<Customer>>("/customers", {
      query: {
        page: query.page,
        limit: query.limit,
        vipTier: query.vipTier,
        customerTypeId: query.customerTypeId,
        kind: query.kind,
        search: query.search,
        includeDeleted: query.includeDeleted,
      },
    }),

  /**
   * GET /customers/stats — the header tiles' numbers (27 September 2026).
   *
   * COUNTED BY THE SERVER, not derived from the list on screen. The obvious
   * shortcut — read `pagination.total` off the list already fetched — is wrong in
   * two ways: that list is filtered, so "Jumlah pelanggan" would fall to 3 while
   * somebody types in the search box, and it cannot answer the other two
   * questions at all, since the list has no date filter.
   */
  stats: (query: { newWithinDays?: number; activeWithinDays?: number } = {}) =>
    apiClient.get<CustomerStats>("/customers/stats", {
      query: {
        newWithinDays: query.newWithinDays,
        activeWithinDays: query.activeWithinDays,
      },
    }),

  /**
   * GET /customers/dormant — who has not been in for `days`, longest absent
   * first. The Ringkasan tab's worklist; capped by the server at 50.
   */
  dormant: (query: { days?: number; limit?: number } = {}) =>
    apiClient.get<DormantCustomerList>("/customers/dormant", {
      query: { days: query.days, limit: query.limit },
    }),

  /** GET /customers/:id — a single customer. */
  getById: (id: string) => apiClient.get<Customer>(`/customers/${id}`),

  /** POST /customers — create a customer (201). */
  create: (input: CreateCustomerInput) =>
    apiClient.post<Customer>("/customers", input),

  /**
   * POST /customers, keeping the envelope — for the caller that needs the
   * WARNINGS beside the created customer.
   *
   * The only one today is the POS quick-add: registering somebody on a phone
   * number another customer already holds SUCCEEDS (FR-2 is explicit — two
   * people in one household share a handset), and the cashier is told so they
   * can check whether this is the same person walking in twice. `create` drops
   * that, because every other caller wants the customer and nothing else.
   */
  createWithWarnings: (input: CreateCustomerInput) =>
    apiClient.postEnvelope<Customer>("/customers", input),

  /** PATCH /customers/:id — update editable fields (send only what changed). */
  update: (id: string, patch: UpdateCustomerInput) =>
    apiClient.patch<Customer>(`/customers/${id}`, patch),

  /** DELETE /customers/:id — soft delete (returns the deleted customer). */
  remove: (id: string) => apiClient.delete<Customer>(`/customers/${id}`),

  /** PATCH /customers/:id/restore — undo a soft delete (may 409 on email clash). */
  restore: (id: string) => apiClient.patch<Customer>(`/customers/${id}/restore`),
};
