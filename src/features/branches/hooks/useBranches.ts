"use client";

import { useCallback, useEffect, useState } from "react";

import { branchService } from "@/services/branch.service";
import { ApiError } from "@/services/api-error";
import type { Branch, BranchListQuery, PageResult } from "@/types/api";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/** The query knobs the list screen drives (page + the visible filters). */
export interface BranchesQuery {
  page: number;
  search: string;
  /** "" = any, true = active only, false = inactive only. */
  active: boolean | "";
  includeDeleted: boolean;
}

const PAGE_SIZE = 20;

const DEFAULT_QUERY: BranchesQuery = {
  page: 1,
  search: "",
  active: "",
  includeDeleted: false,
};

/** Empty page so consumers can render a table shell before the first load. */
const EMPTY_PAGE: PageResult<Branch>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

interface UseBranchesResult {
  branches: Branch[];
  pagination: PageResult<Branch>["pagination"];
  query: BranchesQuery;
  loading: boolean;
  error: string | null;
  /** Merge a partial query change; any change other than `page` resets to page 1. */
  setQuery: (patch: Partial<BranchesQuery>) => void;
  /** Re-run the current query — call after a mutation (delete, restore). */
  refetch: () => void;
}

/**
 * Owns the branch-list query state and fetching for the master/branches screen.
 *
 * Mirrors useUsers: local state, a fetch effect keyed on the query, and an
 * explicit `refetch` the row actions call after they mutate a branch. Any filter
 * change (search/active/deleted) resets to page 1 so the user is never stranded
 * on an out-of-range page. An explicit `limit` is passed so the paged list uses
 * a real page size rather than the service's lookup-oriented default.
 */
export function useBranches(): UseBranchesResult {
  const [query, setQueryState] = useState<BranchesQuery>(DEFAULT_QUERY);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<Branch>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to force the effect to re-run without changing query.
  const [nonce, setNonce] = useState(0);

  // The toolbar keeps the live query so typing stays responsive; only the
  // request waits for the search box to settle.
  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<BranchesQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      // A filter change (anything but an explicit page move) returns to page 1.
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // The query changed (or refetch bumped the nonce): show the loading state,
    // then synchronize with the server. The stale-response guard (`active`)
    // makes the late setStates safe. This mirrors the sanctioned fetch-effect
    // shape in useUsers, so the heuristic lint rule is disabled here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const apiQuery: BranchListQuery = {
      page: settled.page,
      limit: PAGE_SIZE,
      search: settled.search.trim() || undefined,
      isActive: settled.active === "" ? undefined : settled.active,
      includeDeleted: settled.includeDeleted || undefined,
    };

    branchService
      .list(apiQuery)
      .then((result) => {
        if (!active) return;
        setBranches(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setBranches([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load branches. Please try again.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settled, nonce]);

  return { branches, pagination, query, loading, error, setQuery, refetch };
}
