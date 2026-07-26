"use client";

import { useCallback, useEffect, useState } from "react";

import { customerService } from "@/services/customer.service";
import { ApiError } from "@/services/api-error";
import type {
  Customer,
  CustomerListQuery,
  PageResult,
  VipTier,
} from "@/types/api";

/** The query knobs the list screen drives (page + the visible filters). */
export interface CustomersQuery {
  page: number;
  search: string;
  /** "" = any tier, otherwise a specific VIP tier. */
  vipTier: VipTier | "";
  includeDeleted: boolean;
}

const PAGE_SIZE = 20;

const DEFAULT_QUERY: CustomersQuery = {
  page: 1,
  search: "",
  vipTier: "",
  includeDeleted: false,
};

/** Empty page so consumers can render a table shell before the first load. */
const EMPTY_PAGE: PageResult<Customer>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

interface UseCustomersResult {
  customers: Customer[];
  pagination: PageResult<Customer>["pagination"];
  query: CustomersQuery;
  loading: boolean;
  error: string | null;
  /** Merge a partial query change; any change other than `page` resets to page 1. */
  setQuery: (patch: Partial<CustomersQuery>) => void;
  /** Re-run the current query — call after a mutation (delete, restore). */
  refetch: () => void;
}

/**
 * Owns the customer-list query state and fetching for the master/customers
 * screen.
 *
 * Mirrors useBranches: local state, a fetch effect keyed on the query, and an
 * explicit `refetch` the row actions call after they mutate a customer. Any
 * filter change (search/tier/deleted) resets to page 1 so the user is never
 * stranded on an out-of-range page.
 */
export function useCustomers(): UseCustomersResult {
  const [query, setQueryState] = useState<CustomersQuery>(DEFAULT_QUERY);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<Customer>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to force the effect to re-run without changing query.
  const [nonce, setNonce] = useState(0);

  const setQuery = useCallback((patch: Partial<CustomersQuery>) => {
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
    // shape in useBranches, so the heuristic lint rule is disabled here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const apiQuery: CustomerListQuery = {
      page: query.page,
      limit: PAGE_SIZE,
      search: query.search.trim() || undefined,
      vipTier: query.vipTier === "" ? undefined : query.vipTier,
      includeDeleted: query.includeDeleted || undefined,
    };

    customerService
      .list(apiQuery)
      .then((result) => {
        if (!active) return;
        setCustomers(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setCustomers([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load customers. Please try again.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query, nonce]);

  return { customers, pagination, query, loading, error, setQuery, refetch };
}
