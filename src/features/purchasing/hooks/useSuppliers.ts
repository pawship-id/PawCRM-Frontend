"use client";

import { useCallback, useEffect, useState } from "react";

import { supplierService } from "@/services/supplier.service";
import { ApiError } from "@/services/api-error";
import type {
  PageResult,
  Supplier,
  SupplierListQuery,
  SupplierType,
} from "@/types/api";

/**
 * The activity filter, as the toolbar drives it.
 *
 * THREE VALUES, NOT A CHECKBOX. "Only the deactivated ones" is a real question —
 * it is how somebody finds the vendor they switched off last month in order to
 * switch it back on — and a two-state toggle cannot ask it.
 */
export type SupplierActivityFilter = "all" | "active" | "inactive";

/** The query knobs the list screen drives (page + the visible filters). */
export interface SuppliersQuery {
  page: number;
  search: string;
  /** "" = any cooperation model, otherwise a specific one. */
  type: SupplierType | "";
  activity: SupplierActivityFilter;
  includeDeleted: boolean;
}

const PAGE_SIZE = 20;

const DEFAULT_QUERY: SuppliersQuery = {
  page: 1,
  search: "",
  type: "",
  activity: "all",
  includeDeleted: false,
};

/** Empty page so consumers can render a table shell before the first load. */
const EMPTY_PAGE: PageResult<Supplier>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

/** `undefined` means "do not filter" — the API reads an absent flag as both. */
function activityToFlag(activity: SupplierActivityFilter): boolean | undefined {
  if (activity === "active") return true;
  if (activity === "inactive") return false;
  return undefined;
}

interface UseSuppliersResult {
  suppliers: Supplier[];
  pagination: PageResult<Supplier>["pagination"];
  query: SuppliersQuery;
  loading: boolean;
  error: string | null;
  /** Merge a partial query change; any change other than `page` resets to page 1. */
  setQuery: (patch: Partial<SuppliersQuery>) => void;
  /** Re-run the current query — call after a mutation (deactivate, delete, restore). */
  refetch: () => void;
}

/**
 * Owns the supplier-list query state and fetching for the purchasing screen.
 *
 * Mirrors useCustomers: local state, a fetch effect keyed on the query, and an
 * explicit `refetch` the row actions call after they mutate a supplier. Any
 * filter change resets to page 1 so the user is never stranded on a page that no
 * longer exists.
 */
export function useSuppliers(): UseSuppliersResult {
  const [query, setQueryState] = useState<SuppliersQuery>(DEFAULT_QUERY);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<Supplier>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to force the effect to re-run without changing query.
  const [nonce, setNonce] = useState(0);

  const setQuery = useCallback((patch: Partial<SuppliersQuery>) => {
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
    // shape in useCustomers, so the heuristic lint rule is disabled here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const apiQuery: SupplierListQuery = {
      page: query.page,
      limit: PAGE_SIZE,
      search: query.search.trim() || undefined,
      type: query.type === "" ? undefined : query.type,
      isActive: activityToFlag(query.activity),
      includeDeleted: query.includeDeleted || undefined,
    };

    supplierService
      .list(apiQuery)
      .then((result) => {
        if (!active) return;
        setSuppliers(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setSuppliers([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Gagal memuat data supplier. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query, nonce]);

  return { suppliers, pagination, query, loading, error, setQuery, refetch };
}
