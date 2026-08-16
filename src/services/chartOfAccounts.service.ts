import { apiClient } from "./api-client";
import type { ChartOfAccount, ChartOfAccountNode } from "@/types/accounting";
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
/**
 * The API's hard page-size cap (`pagination` in the backend's
 * common.validation.js). Asking for more is a 400, not a bigger page.
 *
 * Clamped rather than merely defaulted, because a default only protects the
 * caller that omits the field — and the failure is silent here: the product
 * form catches the rejection and reports "accounting unavailable", so a caller
 * that asked for 500 would see a section quietly stop working rather than an
 * error naming what it did.
 */
const MAX_PAGE_LIMIT = 100;

export interface ChartOfAccountListQuery {
  page?: number;
  limit?: number;
  search?: string;
  /** `income`, `asset`, … — narrows the list to one class. */
  accountType?: ChartOfAccount["accountType"];
  isActive?: boolean;
}

/**
 * The tree endpoint's filters — the only two it accepts, and neither is a page.
 *
 * There is no `search` here on purpose: the API does not offer one on /tree,
 * because a text filter applied server-side would return matches with their
 * ancestors missing, which is not a tree. The COA screen searches the tree it
 * already holds and drags each match's ancestors along with it.
 */
export interface ChartOfAccountTreeQuery {
  accountType?: ChartOfAccount["accountType"];
  isActive?: boolean;
}

/**
 * The writable half of an account.
 *
 * `isDefault` is absent, and cannot be added: the backend's validation layer
 * strips it, because it is the flag the delete and immutability guards hang off
 * — a client that could set it (or clear it) could escape them.
 *
 * `parentAccountId: null` is a VALUE, not an omission — it is how an account is
 * moved to the root of the tree. Which is why the update payload is a Partial:
 * omitting the key leaves the parent alone, and sending null detaches it, and
 * those are different requests.
 */
export interface ChartOfAccountPayload {
  code: string;
  name: string;
  accountType: ChartOfAccount["accountType"];
  parentAccountId: string | null;
  /** Defaults to true on the server — for a chart imported ahead of go-live. */
  isActive?: boolean;
}

export const chartOfAccountsService = {
  /**
   * GET /chart-of-accounts — paginated, searchable, filterable by class.
   *
   * `limit: 100` because that is the API's HARD CAP (`pagination` in
   * common.validation.js). Asking for more is not a larger page, it is a 400 —
   * which is exactly what shipped first here and made the product form's
   * accounting section fail for every user while reporting it as a permissions
   * problem.
   *
   * 100 is enough in practice for the caller this exists for: the product form
   * asks with `accountType: "income"`, and a chart with more than a hundred
   * income accounts is not a chart anyone picks from with a dropdown. Should
   * that ever stop being true, the fix is a searchable picker, not a bigger
   * number — the cap will not move.
   */
  list: (query: ChartOfAccountListQuery = {}) =>
    apiClient.get<PageResult<ChartOfAccount>>("/chart-of-accounts", {
      query: {
        page: query.page,
        limit: Math.min(query.limit ?? MAX_PAGE_LIMIT, MAX_PAGE_LIMIT),
        search: query.search,
        accountType: query.accountType,
        isActive: query.isActive,
      },
    }),

  /**
   * GET /chart-of-accounts/tree — the whole live chart, nested by
   * `parentAccountId`. Roots come back as a bare array; each node carries its
   * own `children`.
   *
   * NO PAGINATION, and none to add: a tree cut off at page 1 is not a tree. The
   * response is bounded by how many accounts a business keeps (tens to low
   * hundreds), which is why the COA screen can filter and search in the browser
   * instead of asking again per keystroke.
   *
   * Deleted accounts are excluded by the backend and cannot be asked for here —
   * unlike `list`, the tree has no `includeDeleted`.
   */
  tree: (query: ChartOfAccountTreeQuery = {}) =>
    apiClient.get<ChartOfAccountNode[]>("/chart-of-accounts/tree", {
      query: {
        accountType: query.accountType,
        isActive: query.isActive,
      },
    }),

  /** GET /chart-of-accounts/:id — a single account. */
  getById: (id: string) =>
    apiClient.get<ChartOfAccount>(`/chart-of-accounts/${id}`),

  /**
   * POST /chart-of-accounts — a new account, always `isDefault: false`.
   *
   * The refusals worth handling at the call site: 409 when the code is taken,
   * and 400 for each structural rule on the parent — unknown, a different
   * class, or already at the maximum depth.
   */
  create: (payload: ChartOfAccountPayload) =>
    apiClient.post<ChartOfAccount>("/chart-of-accounts", payload),

  /**
   * PATCH /chart-of-accounts/:id — send only what changed.
   *
   * AN EMPTY BODY IS A 400, not a no-op: the server treats a request that
   * changes nothing as a client bug. Callers compare against the current values
   * and skip the request entirely when nothing moved.
   *
   * On a SEEDED account (`isDefault`), `code` and `accountType` come back 403 —
   * every posting resolves its target by code, so renumbering 1201 would
   * silently redirect every inventory entry in the tenant. `name`, `isActive`
   * and the parent stay editable.
   */
  update: (id: string, payload: Partial<ChartOfAccountPayload>) =>
    apiClient.patch<ChartOfAccount>(`/chart-of-accounts/${id}`, payload),
};
