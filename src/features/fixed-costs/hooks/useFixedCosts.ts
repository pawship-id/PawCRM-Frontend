"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";
import { ApiError } from "@/services/api-error";
import { fixedCostService } from "@/services/fixedCost.service";
import type {
  FixedCost,
  FixedCostListQuery,
  FixedCostSort,
  FixedCostTotals,
} from "@/types/accounting";

/** What the rows-per-page control offers. Starts at 25, like every other list. */
export const FIXED_COST_PAGE_SIZES = [25, 50, 100];

export interface FixedCostsQuery {
  page: number;
  limit: number;
  search: string;
  /** `""` is the filter layer's "not filtering". */
  kind: "expense" | "other_income" | "";
  /** Tri-state: `""` shows paused rows alongside running ones. */
  status: "active" | "paused" | "";
  accountId: string;
  sort: FixedCostSort;
}

export const DEFAULT_FIXED_COSTS_QUERY: FixedCostsQuery = {
  page: 1,
  limit: 25,
  search: "",
  kind: "",
  /*
    RUNNING ONES BY DEFAULT — the mockup's caption is "Biaya Tetap Aktif", and
    the question the screen is opened with is "what do I owe next". A paused
    lease owes nothing. `""` brings them back, muted, and the filter says so.
  */
  status: "active",
  accountId: "",
  // The schedule is read forwards, unlike a cash book: soonest due first.
  sort: "dueSoonest",
};

export interface UseFixedCostsResult {
  fixedCosts: FixedCost[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  /**
   * Σ over the ACTIVE rows in the whole filter — or null while a new filter is
   * in flight or after a failure. Null, not zero: a card reading Rp 0 for a
   * figure nobody fetched states a fact about somebody's costs that is untrue.
   */
  totals: FixedCostTotals | null;
  query: FixedCostsQuery;
  loading: boolean;
  error: string | null;
  setQuery: (patch: Partial<FixedCostsQuery>) => void;
  refetch: () => void;
}

const EMPTY_PAGE = { page: 1, limit: 25, total: 0, totalPages: 0 };

/**
 * The Biaya Tetap list, from GET /fixed-costs.
 *
 * EVERY FILTER IS SERVER-SIDE, and ONE REQUEST carries the rows and the totals,
 * so the cards and the table cannot be scoped differently — the same shape
 * `useCashTransactions` takes, for the same reason.
 *
 * THE TOTALS CLEAR ON A FILTER CHANGE, not on a page turn: they do not depend
 * on the page, and a stale figure under a new filter looks exactly like a right
 * one.
 */
export function useFixedCosts(
  initial: Partial<FixedCostsQuery> = {},
  /**
   * `enabled: false` FETCHES NOTHING and settles as loaded-and-empty.
   *
   * For a reader with no `fixedCosts:read` grant, whose screen shows the "minta
   * admin" card instead. Without it the hook fires a request the server is
   * bound to refuse, and a 403 in the console on a page that rendered correctly
   * is the kind of noise that teaches people to ignore the console. Same shape
   * as `useCashBankAccounts`.
   */
  { enabled = true }: { enabled?: boolean } = {},
): UseFixedCostsResult {
  const [query, setQueryState] = useState<FixedCostsQuery>(() => ({
    ...DEFAULT_FIXED_COSTS_QUERY,
    ...initial,
  }));
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [pagination, setPagination] = useState(EMPTY_PAGE);
  const [totals, setTotals] = useState<FixedCostTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const settled = useDebouncedQuery(query);
  const lastFilterKey = useRef<string | null>(null);

  const setQuery = useCallback((patch: Partial<FixedCostsQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    let active = true;
    const search = settled.search.trim();

    // Everything that narrows the set — the page, its size and the ordering do
    // not. `totals` are Σ over the whole filtered set, so they survive all three.
    const filterKey = JSON.stringify({
      ...settled,
      search,
      page: undefined,
      limit: undefined,
      sort: undefined,
    });

    // The sanctioned fetch-effect shape: flag the load, then synchronize with
    // the server, `active` guarding the late setStates.
    setLoading(true);
    setError(null);
    if (filterKey !== lastFilterKey.current) setTotals(null);
    lastFilterKey.current = filterKey;

    const listQuery: FixedCostListQuery = {
      page: settled.page,
      limit: settled.limit,
      sort: settled.sort,
      search: search || undefined,
      kind: settled.kind || undefined,
      accountId: settled.accountId || undefined,
      // `""` asks for both, so the flag is only sent when it narrows something.
      isActive:
        settled.status === "" ? undefined : settled.status === "active",
    };

    fixedCostService
      .list(listQuery)
      .then((result) => {
        if (!active) return;
        setFixedCosts(result.items);
        setPagination(result.pagination);
        setTotals(result.totals ?? null);
      })
      .catch((err) => {
        if (!active) return;
        setFixedCosts([]);
        setPagination(EMPTY_PAGE);
        setTotals(null);
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat biaya tetap. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settled, nonce, enabled]);

  return {
    fixedCosts,
    pagination,
    totals,
    query,
    loading,
    error,
    setQuery,
    refetch,
  };
}
