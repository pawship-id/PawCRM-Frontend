"use client";

import { useCallback, useEffect, useState } from "react";

import { customerService } from "@/services/customer.service";
import { ApiError } from "@/services/api-error";
import type {
  Customer,
  CustomerKind,
  CustomerListQuery,
  PageResult,
  VipTier,
} from "@/types/api";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/** The query knobs the list screen drives (page + the visible filters). */
export interface CustomersQuery {
  page: number;
  search: string;
  /** "" = any tier, otherwise a specific VIP tier. */
  vipTier: VipTier | "";
  /** "" = any category, otherwise one of the tenant's Tipe pelanggan. */
  customerTypeId: string;
  /** "" = both, otherwise Perorangan or Perusahaan. */
  kind: CustomerKind | "";
  /**
   * "" = any status, otherwise active-only or inactive-only.
   *
   * DEFAULTS TO `true`, UNLIKE `BranchesQuery.active`'S `""` (2 October 2026,
   * on request) — the register opens on "Aktif" and a reader asks for
   * "Semua status" to see more, rather than opening on everything and being
   * asked to narrow it. A customer going inactive is also the far more common
   * path here than it is for the tenant's handful of branches, so a table
   * that defaulted to "Semua" would routinely mix the two in a way the
   * branches list, with the much smaller inactive share, does not.
   */
  active: boolean | "";
  includeDeleted: boolean;
  /**
   * `""` = not filtering. Set only by a deep link (2 October 2026) — the
   * Ringkasan tab's "Pelanggan baru" card, whose "Lihat semua" carries the
   * ISO cutoff it was measured from. No toolbar control of its own; the
   * toolbar's chip is how it comes off, the same shape `documentId` takes on
   * the Transaksi screen (`CashTransactionsQuery`).
   */
  createdSince: string;
}

const PAGE_SIZE = 20;

const DEFAULT_QUERY: CustomersQuery = {
  page: 1,
  search: "",
  vipTier: "",
  customerTypeId: "",
  kind: "",
  active: true,
  includeDeleted: false,
  createdSince: "",
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
 *
 * `initial` SEEDS THE STATE, NOT A PROP THE SCREEN RE-READS (2 October 2026)
 * — the same lazy-`useState` merge `useCashTransactions` uses for its own
 * deep links. The server page parses `?createdSince=` and hands the result in
 * once; after that this hook owns the query like any other filter.
 */
export function useCustomers(
  initial: Partial<CustomersQuery> = {},
): UseCustomersResult {
  const [query, setQueryState] = useState<CustomersQuery>(() => ({
    ...DEFAULT_QUERY,
    ...initial,
  }));
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<Customer>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to force the effect to re-run without changing query.
  const [nonce, setNonce] = useState(0);

  // The toolbar keeps the live query so typing stays responsive; only the
  // request waits for the search box to settle.
  const settled = useDebouncedQuery(query);

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
      page: settled.page,
      limit: PAGE_SIZE,
      search: settled.search.trim() || undefined,
      vipTier: settled.vipTier === "" ? undefined : settled.vipTier,
      // "" means "not filtering", which is an ABSENT parameter rather than an
      // empty one: sent as "" the server would look for a customer filed under
      // the empty string and answer with nothing.
      customerTypeId:
        settled.customerTypeId === "" ? undefined : settled.customerTypeId,
      kind: settled.kind === "" ? undefined : settled.kind,
      isActive: settled.active === "" ? undefined : settled.active,
      includeDeleted: settled.includeDeleted || undefined,
      createdSince: settled.createdSince || undefined,
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
  }, [settled, nonce]);

  return { customers, pagination, query, loading, error, setQuery, refetch };
}
