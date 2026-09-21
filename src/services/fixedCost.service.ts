import { apiClient } from "./api-client";
import type {
  CreateFixedCostInput,
  FixedCost,
  FixedCostListQuery,
  FixedCostListResponse,
  UpdateFixedCostInput,
} from "@/types/accounting";
import type { CashTransaction } from "@/types/api";

/**
 * Biaya Tetap — the schedule of costs a shop knows it will meet again, against
 * /api/fixed-costs.
 *
 * TEMPLATES, NOT MONEY. Every call here but `post` edits a plan that has never
 * touched the ledger. `post` records the occurrence that is due as an ordinary
 * cash transaction, with its own journal entry, and is gated by its own
 * permission for exactly that reason.
 *
 * One typed operation per apiClient request, no React, mirroring
 * cashTransaction.service.ts. The tenant comes from the session cookie.
 */

/** The API's hard page-size cap (`LIST_MAX_LIMIT` in the model). */
const MAX_PAGE_LIMIT = 100;

export const fixedCostService = {
  /**
   * GET /fixed-costs — one page, plus `totals` over the WHOLE filter.
   *
   * THE TOTALS COUNT ACTIVE ROWS ONLY, whatever `isActive` is asked for: the
   * figure answers "what do these come to a month", and a paused subscription
   * costs nothing this month.
   */
  list: (query: FixedCostListQuery = {}) =>
    apiClient.get<FixedCostListResponse>("/fixed-costs", {
      query: {
        ...query,
        limit: query.limit ? Math.min(query.limit, MAX_PAGE_LIMIT) : undefined,
      },
    }),

  getById: (id: string) => apiClient.get<FixedCost>(`/fixed-costs/${id}`),

  create: (input: CreateFixedCostInput) =>
    apiClient.post<FixedCost>("/fixed-costs", input),

  update: (id: string, input: UpdateFixedCostInput) =>
    apiClient.patch<FixedCost>(`/fixed-costs/${id}`, input),

  /**
   * POST /fixed-costs/:id/post — record the occurrence that is due.
   *
   * THE ONLY CALL HERE THAT MOVES MONEY. It answers with BOTH halves: the
   * transaction it created and the schedule it advanced, so a caller redraws
   * the row without a second request.
   *
   * IT ALWAYS POSTS THE NEXT OUTSTANDING OCCURRENCE — never one the caller
   * names. `at` only moves the DATE the transaction is stamped with, for a
   * clerk recording on the 3rd a rent that fell due on the 1st.
   */
  post: (id: string, input: { at?: string; note?: string; ref?: string } = {}) =>
    apiClient.post<{ fixedCost: FixedCost; transaction: CashTransaction }>(
      `/fixed-costs/${id}/post`,
      input,
    ),

  /**
   * Soft delete. The transactions it has already posted are untouched — they
   * were money, and money does not become un-moved because the arrangement
   * behind it ended.
   */
  remove: (id: string) => apiClient.delete<FixedCost>(`/fixed-costs/${id}`),
};
