import { apiClient } from "./api-client";
import type { ChartOfAccount } from "@/types/accounting";
import type { PageResult } from "@/types/api";

/**
 * Chart-of-accounts calls against /api/chart-of-accounts.
 *
 * THE FIRST REAL CONSUMER OF THIS ENDPOINT. The accounting screens are still
 * prototypes running on `features/accounting/data/dummy.ts`, so nothing else has
 * ever exercised the route — expect the shapes in `types/accounting.ts` to need
 * correcting the first time something here disagrees with the API rather than
 * assuming the types are right.
 *
 * What brought it here is the product form's **Akun penjualan** picker: a
 * product may name the income account a sale of it credits. Nothing posts
 * against that field yet (there is no sales module), but the catalogue is where
 * a tenant knows the answer, and asking retroactively for every product on the
 * day the POS ships is the alternative.
 *
 * One typed domain operation per apiClient request — no React, no state,
 * mirroring category.service.ts. The tenant scope comes from the session cookie
 * on the backend, so it is never passed here.
 */
export interface ChartOfAccountListQuery {
  page?: number;
  limit?: number;
  search?: string;
  /** `income`, `asset`, … — narrows the list to one class. */
  accountType?: ChartOfAccount["accountType"];
  isActive?: boolean;
}

export const chartOfAccountsService = {
  /**
   * GET /chart-of-accounts — paginated, searchable, filterable by class.
   *
   * Defaults to `limit: 200`, higher than the 100 categories and branches use.
   * A chart of accounts is genuinely larger than either — the seed alone is 11
   * and a real one runs to dozens — and every caller so far is a picker that
   * wants the whole set in one page. A picker that silently showed the first
   * page would be a picker missing accounts, with nothing on screen to say so.
   */
  list: (query: ChartOfAccountListQuery = {}) =>
    apiClient.get<PageResult<ChartOfAccount>>("/chart-of-accounts", {
      query: {
        page: query.page,
        limit: query.limit ?? 200,
        search: query.search,
        accountType: query.accountType,
        isActive: query.isActive,
      },
    }),

  /** GET /chart-of-accounts/:id — a single account. */
  getById: (id: string) =>
    apiClient.get<ChartOfAccount>(`/chart-of-accounts/${id}`),
};
