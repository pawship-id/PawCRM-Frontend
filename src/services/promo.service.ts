import { apiClient } from "./api-client";
import type {
  CreatePromoInput,
  Promo,
  PromoAttentionItem,
  PromoListQuery,
  PromoListResponse,
  PromoQuoteInput,
  PromoQuoteResponse,
  PromoReport,
  UpdatePromoInput,
} from "@/types/promo";

/**
 * Promo V1, against /api/promos — PawCRM-Backend/docs/promo-v1.md.
 * One typed operation per request, no React.
 */

const MAX_PAGE_LIMIT = 100;

export const promoService = {
  list: (query: PromoListQuery = {}) =>
    apiClient.get<PromoListResponse>("/promos", {
      query: { ...query, limit: query.limit ? Math.min(query.limit, MAX_PAGE_LIMIT) : undefined },
    }),

  get: (id: string) => apiClient.get<Promo>(`/promos/${id}`),

  create: (input: CreatePromoInput) => apiClient.post<Promo>("/promos", input),

  update: (id: string, input: UpdatePromoInput) => apiClient.patch<Promo>(`/promos/${id}`, input),

  /** "Hentikan" — ends now; end date becomes today. */
  stop: (id: string) => apiClient.post<Promo>(`/promos/${id}/stop`, {}),

  /** Only a draft or a promo nobody has used yet (409 otherwise). */
  remove: (id: string) => apiClient.delete<{ id: string; deleted: true }>(`/promos/${id}`),

  attention: (days = 14) =>
    apiClient.get<{ items: PromoAttentionItem[] }>("/promos/attention", { query: { days } }),

  report: (query: { dateFrom?: string; dateTo?: string; branchId?: string } = {}) =>
    apiClient.get<PromoReport>("/promos/report", { query }),

  quote: (input: PromoQuoteInput) => apiClient.post<PromoQuoteResponse>("/promos/quote", input),
};
