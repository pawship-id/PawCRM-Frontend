import { apiClient } from "./api-client";
import type { PageResult } from "@/types/api";

/**
 * Customer-type calls against /api/customer-types — Pengaturan › Tipe
 * pelanggan (24 September 2026).
 *
 * A customer type is a tenant's own label for the kind of customer it deals
 * with — Reguler, Reseller, Grosir. Free labels the tenant manages itself,
 * matching `businessLineService`, which is why uniqueness is per-tenant and
 * two unrelated shops may both have a "Reseller".
 *
 * ⚠️ NOTHING READS THIS YET. No customer names a type, no price list reads
 * one. This is a working list before it is a used one.
 */

/** One customer type. Mirrors the backend model — a label and a note. */
export interface CustomerType {
  _id: string;
  name: string;
  /** A sentence explaining the type, not a second category. Null if unset. */
  note: string | null;
}

/** The API's hard page-size cap, matching businessLine.service.ts. */
const MAX_PAGE_LIMIT = 100;

export interface CustomerTypeListQuery {
  page?: number;
  limit?: number;
  search?: string;
}

/** What POST takes. Only `name` is required. */
export interface CreateCustomerTypeInput {
  name: string;
  /** Omit, or send `""`, to leave it unset. */
  note?: string | null;
}

/** What PATCH takes: any subset, but never an empty body. */
export type UpdateCustomerTypeInput = Partial<CreateCustomerTypeInput>;

export const customerTypeService = {
  /**
   * GET /customer-types — paginated, searchable list.
   *
   * Defaults to `limit: 100`, matching business lines: a tenant runs a
   * handful of customer types, and the settings screen wants them all in one
   * page.
   */
  list: (query: CustomerTypeListQuery = {}) =>
    apiClient.get<PageResult<CustomerType>>("/customer-types", {
      query: {
        page: query.page,
        limit: Math.min(query.limit ?? MAX_PAGE_LIMIT, MAX_PAGE_LIMIT),
        search: query.search,
      },
    }),

  /** GET /customer-types/:id — a single type. */
  getById: (id: string) =>
    apiClient.get<CustomerType>(`/customer-types/${id}`),

  create: (body: CreateCustomerTypeInput) =>
    apiClient.post<CustomerType>("/customer-types", body),

  update: (id: string, body: UpdateCustomerTypeInput) =>
    apiClient.patch<CustomerType>(`/customer-types/${id}`, body),
};
