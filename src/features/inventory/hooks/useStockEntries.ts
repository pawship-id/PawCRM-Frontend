"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { stockEntryService } from "@/services/stockEntry.service";
import { branchService } from "@/services/branch.service";
import { warehouseService } from "@/services/warehouse.service";
import type { StockEntry, StockEntryKind } from "@/types/inventory";
import type { Branch, Warehouse } from "@/types/api";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/** The knobs the list offers. `kind` is fixed by the screen, never by the user. */
export interface StockEntriesQuery {
  search: string;
  /**
   * Both scopes are offered because they are NOT 1:1 — a central warehouse can
   * serve three branches, and a branch can hold two warehouses. Narrowing by one
   * never implies the other, so neither can stand in for the other.
   */
  branchId: string;
  warehouseId: string;
  page: number;
}

const DEFAULT_QUERY: StockEntriesQuery = {
  search: "",
  branchId: "",
  warehouseId: "",
  page: 1,
};

const LIMIT = 20;

export interface UseStockEntriesResult {
  entries: StockEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  /** The two filters' options. Empty when the user cannot read them. */
  branches: Branch[];
  warehouses: Warehouse[];
  query: StockEntriesQuery;
  loading: boolean;
  error: string | null;
  setQuery: (patch: Partial<StockEntriesQuery>) => void;
  refetch: () => void;
}

/**
 * One kind of hand-typed stock document, paged.
 *
 * THE FILTER GOES TO THE SERVER, not to a page already in the browser. A list
 * pages at twenty and a busy month spans several, so narrowing here would
 * silently answer "documents at Gudang Pusat" with "the ones that happened to be
 * on page 1" — the failure the ledger screen names in its own header.
 *
 * THE FILTER LISTS FAIL SOFTLY. A user may hold `stockMovements:read` without
 * `warehouses:read` or `branches:read`, and a document list that refused to
 * render because a dropdown could not be populated would withhold the rows over
 * the filter.
 */
export function useStockEntries(kind: StockEntryKind): UseStockEntriesResult {
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const [query, setQueryState] = useState<StockEntriesQuery>(DEFAULT_QUERY);
  // Only the text field earns a wait; a changed dropdown is a finished decision.
  const debounced = useDebouncedQuery(query);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  /**
   * ANY FILTER CHANGE RESETS TO PAGE 1 — unless the change IS the page. Staying
   * on page 4 of a narrower result is how a screen answers a fresh question with
   * an empty table.
   */
  const setQuery = useCallback((patch: Partial<StockEntriesQuery>) => {
    setQueryState((prev) => ({
      ...prev,
      ...patch,
      page: patch.page ?? 1,
    }));
  }, []);

  useEffect(() => {
    let active = true;

    warehouseService
      .list({ limit: 100 })
      .then((result) => {
        if (active) setWarehouses(result.items);
      })
      .catch(() => {
        // Soft: see the header. The list still renders without its filter.
        if (active) setWarehouses([]);
      });

    branchService
      .list({ limit: 100 })
      .then((result) => {
        if (active) setBranches(result.items);
      })
      .catch(() => {
        if (active) setBranches([]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    stockEntryService
      .list({
        kind,
        page: debounced.page,
        limit: LIMIT,
        search: debounced.search.trim() || undefined,
        branchId: debounced.branchId || undefined,
        warehouseId: debounced.warehouseId || undefined,
      })
      .then((result) => {
        if (!active) return;
        setEntries(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setEntries([]);
        setError(
          err instanceof ApiError ? err.message : "Daftar gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    kind,
    debounced.page,
    debounced.search,
    debounced.branchId,
    debounced.warehouseId,
    nonce,
  ]);

  return {
    entries,
    pagination,
    branches,
    warehouses,
    query,
    loading,
    error,
    setQuery,
    refetch,
  };
}
