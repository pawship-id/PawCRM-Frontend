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
 * WHERE A LINE IS NAMED: the chart of accounts. A tenant sets its chart up once
 * and knows, while naming the line on "5102 HPP Grooming", that everything
 * landing there belongs to grooming — so the mapping is made at the account
 * rather than per product or per transaction. The ledger already stores
 * `lines[].businessLineId` for journal tagging; carrying the account's value
 * into it is a separate change.
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

/** What POST takes. Both are required — the API refuses a line with no colour. */
export interface CreateBusinessLineInput {
  name: string;
  /** `#RRGGBB`. Three-digit shorthand and named colours are refused. */
  color: string;
}

/** What PATCH takes: any subset, but never an empty body. */
export type UpdateBusinessLineInput = Partial<CreateBusinessLineInput>;

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

  create: (body: CreateBusinessLineInput) =>
    apiClient.post<BusinessLine>("/business-lines", body),

  update: (id: string, body: UpdateBusinessLineInput) =>
    apiClient.patch<BusinessLine>(`/business-lines/${id}`, body),

  /**
   * DELETE /business-lines/:id — a SOFT delete.
   *
   * Answers 409 while any product or any account still names the line, and the
   * message carries the count. Journal entries are NOT guarded: they are
   * immutable, so a guard on them would make a line undeletable forever the
   * moment anything posted against it.
   */
  remove: (id: string) =>
    apiClient.delete<BusinessLine>(`/business-lines/${id}`),

  restore: (id: string) =>
    apiClient.patch<BusinessLine>(`/business-lines/${id}/restore`, {}),
};
