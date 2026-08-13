import { apiClient } from "./api-client";
import type { PageResult } from "@/types/api";

/**
 * Business-line calls against /api/business-lines.
 *
 * A business line is a line of business a tenant operates — Grooming, Hotel,
 * Retail. Free labels the tenant manages itself, not a fixed enum, which is why
 * uniqueness is per-tenant and two unrelated businesses may both run a
 * "Grooming".
 *
 * LIKE chartOfAccounts.service.ts, THIS IS THE ENDPOINT'S FIRST REAL CONSUMER —
 * the product form's business-line picker. The ledger already stores
 * `lines[].businessLineId` for journal tagging; naming one on the product is
 * what will let a posting derive it instead of asking at the till.
 */

/** One line of business. Mirrors the backend model — a label and a colour. */
export interface BusinessLine {
  _id: string;
  name: string;
  /** A 6-digit hex colour with a leading `#`. Required by the API. */
  color: string;
}

/** The API's hard page-size cap — see chartOfAccounts.service.ts. */
const MAX_PAGE_LIMIT = 100;

export interface BusinessLineListQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export const businessLineService = {
  /**
   * GET /business-lines — paginated, searchable list.
   *
   * Defaults to `limit: 100`, matching categories and branches: a tenant runs a
   * handful of lines, and every caller so far is a picker that wants them all.
   */
  list: (query: BusinessLineListQuery = {}) =>
    apiClient.get<PageResult<BusinessLine>>("/business-lines", {
      query: {
        page: query.page,
        limit: Math.min(query.limit ?? MAX_PAGE_LIMIT, MAX_PAGE_LIMIT),
        search: query.search,
      },
    }),

  /** GET /business-lines/:id — a single line. */
  getById: (id: string) => apiClient.get<BusinessLine>(`/business-lines/${id}`),
};
