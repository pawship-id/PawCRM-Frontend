"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/services/api-error";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import type { ChartOfAccount, ChartOfAccountNode } from "@/types/accounting";

export interface UseChartOfAccountsResult {
  /**
   * Every account the tenant has, flattened depth-first — a parent always
   * appears before the accounts filed under it, and siblings keep the
   * account-number order the API sorted them into.
   */
  accounts: ChartOfAccount[];
  /** The same accounts keyed by `_id`, for walking a row's ancestors. */
  byId: Map<string, ChartOfAccount>;
  loading: boolean;
  error: string | null;
  /** Re-run the request — the retry the error banner offers. */
  refetch: () => void;
}

/**
 * The tenant's chart of accounts, read from GET /chart-of-accounts/tree.
 *
 * ONE REQUEST, NO QUERY PARAMS, and the filtering happens in the browser. The
 * endpoint would take `accountType` and `isActive`, but sending either costs
 * more than it saves here:
 *
 *   - the screen's summary tiles count accounts PER CLASS, and a response
 *     narrowed to one class cannot produce the other four counts;
 *   - `isActive: true` drops an inactive parent while keeping its active child,
 *     and the backend then surfaces that child at the root — a chart that
 *     silently restructures itself when a toggle is flipped;
 *   - the whole chart is tens to low hundreds of rows, so the round trip buys
 *     nothing a `.filter()` does not already give.
 *
 * The flat array is what the screen renders from, rather than the nested nodes:
 * search has to keep each match's ancestors, which is a walk UP the tree, and
 * `parentAccountId` plus a lookup map answers that directly. The nesting is
 * still what orders the array — the API's `children` arrays are already sorted
 * by code, and a depth-first flatten preserves that.
 */
export function useChartOfAccounts(): UseChartOfAccountsResult {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to re-run the effect without a query to change.
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // Same sanctioned fetch-effect shape as useCategories: flag the load, then
    // synchronize with the server, with `active` guarding the late setStates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    chartOfAccountsService
      .tree()
      .then((roots) => {
        if (!active) return;
        setAccounts(flatten(roots));
      })
      .catch((err) => {
        if (!active) return;
        setAccounts([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Gagal memuat daftar akun. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [nonce]);

  const byId = useMemo(
    () => new Map(accounts.map((account) => [account._id, account])),
    [accounts],
  );

  return { accounts, byId, loading, error, refetch };
}

/**
 * Nested nodes → one flat array, parents first.
 *
 * `children` is dropped from each record: the screen reads the hierarchy through
 * `parentAccountId`, and keeping both would leave two descriptions of the same
 * relationship to disagree the first time anything filters the list.
 */
function flatten(nodes: ChartOfAccountNode[]): ChartOfAccount[] {
  const flat: ChartOfAccount[] = [];

  const walk = (level: ChartOfAccountNode[]) => {
    for (const { children, ...account } of level) {
      flat.push(account);
      // A leaf still carries an (empty) array from the API; guarded anyway, so
      // a node missing the field is a shallower tree rather than a crash.
      if (children?.length) walk(children);
    }
  };
  walk(nodes);

  return flat;
}
