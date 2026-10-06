import { apiClient } from "./api-client";
import type {
  RemapApplyResult,
  RemapPeriod,
  RemapSummary,
  SubAccount,
  SubAccountInput,
  SubAccountRemoval,
} from "@/types/accounting";

/**
 * Sub akun calls — the records that replaced an account's embedded Detil Akun
 * list (Sub-Akun-Implementation-Plan §8).
 *
 * TWO ROUTES FOR TWO JOBS. Writes and the per-account read live under the
 * account they belong to, `/chart-of-accounts/:id/sub-accounts`; the PICKER —
 * every live sub akun of the tenant, narrowed by account, status or branch — is
 * `/sub-accounts`. Both sit behind `chartOfAccounts`, so a form that offers a
 * picker needs the same grant the chart does, and says so when it is refused.
 *
 * Lists are bare arrays: one account's sub akun are a short, whole set.
 */

export interface SubAccountPickerQuery {
  accountId?: string;
  /** `true` for what a NEW posting may pick; omitted for every live one. */
  isActive?: boolean;
  /**
   * Narrows to the sub akun that fit this branch — those pinned to it, plus
   * those pinned to none. Meant for a posting that already knows its branch.
   */
  branchId?: string;
}

export const subAccountService = {
  /** GET /sub-accounts — the picker. */
  pick: (query: SubAccountPickerQuery = {}) =>
    apiClient.get<SubAccount[]>("/sub-accounts", {
      query: {
        accountId: query.accountId,
        isActive: query.isActive,
        branchId: query.branchId,
      },
    }),

  /** GET /chart-of-accounts/:id/sub-accounts — one account's, inactive included. */
  list: (accountId: string, query: { isActive?: boolean } = {}) =>
    apiClient.get<SubAccount[]>(`/chart-of-accounts/${accountId}/sub-accounts`, {
      query: { isActive: query.isActive },
    }),

  /**
   * POST — `code` must start with `<parent code>-` (the server uppercases it);
   * `businessLineId` is required for `direct` and refused otherwise, and
   * `branchId` is for `direct` only and must be one of the account's branches.
   */
  create: (accountId: string, payload: SubAccountInput) =>
    apiClient.post<SubAccount>(
      `/chart-of-accounts/${accountId}/sub-accounts`,
      payload,
    ),

  /** PATCH — any subset. An empty body is a 400. */
  update: (
    accountId: string,
    subId: string,
    payload: Partial<SubAccountInput>,
  ) =>
    apiClient.patch<SubAccount>(
      `/chart-of-accounts/${accountId}/sub-accounts/${subId}`,
      payload,
    ),

  /**
   * DELETE — deletes, or DEACTIVATES when any journal entry, cash transaction
   * or fixed cost still names it. Both are a 200; `outcome` says which, and the
   * caller must say so too, because "Hapus" that leaves the row on screen reads
   * as a failure.
   */
  remove: (accountId: string, subId: string) =>
    apiClient.delete<SubAccountRemoval>(
      `/chart-of-accounts/${accountId}/sub-accounts/${subId}`,
    ),

  /**
   * POST .../history/preview — what "Terapkan ke data lama" would move. Writes
   * nothing. Needs `chartOfAccounts:remapHistory`.
   */
  remapPreview: (accountId: string, subId: string, body: RemapPeriod) =>
    apiClient.post<RemapSummary>(
      `/chart-of-accounts/${accountId}/sub-accounts/${subId}/history/preview`,
      body,
    ),

  /**
   * POST .../history/apply — recomputes on the server and refuses with a 409
   * (`ApiError.data.current` = the fresh numbers) when `expected` is stale.
   */
  remapApply: (
    accountId: string,
    subId: string,
    body: RemapPeriod & { expected: { lines: number; amount: string } },
  ) =>
    apiClient.post<RemapApplyResult>(
      `/chart-of-accounts/${accountId}/sub-accounts/${subId}/history/apply`,
      body,
    ),
};
