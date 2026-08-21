"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { stockMovementService } from "@/services/stockMovement.service";
import { warehouseService } from "@/services/warehouse.service";
import type {
  StockTransferSort,
  StockTransferSummary,
} from "@/types/inventory";
import type { Warehouse } from "@/types/api";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";
import { useAuth } from "@/features/auth";
import { accessibleWarehouses } from "@/utils/accessScope";

/** The knobs the transfer list offers. */
export interface StockTransfersQuery {
  search: string;
  /**
   * ONE FIELD FOR BOTH ENDS. A transfer belongs to the two warehouses it
   * touches, and the server matches either — so "Gudang Bazar" answers "what
   * does Gudang Bazar have to do with", not "what left it". Two fields would
   * mostly be filled in wrongly: the person asking rarely knows which end
   * theirs was.
   */
  warehouseId: string;
  /**
   * Always set, never cleared: a list with no ordering is not a thing. Reset
   * returns it to `newest` rather than emptying it.
   */
  sort: StockTransferSort;
  page: number;
}

const DEFAULT_QUERY: StockTransfersQuery = {
  search: "",
  warehouseId: "",
  sort: "newest",
  page: 1,
};

const LIMIT = 20;

export interface UseStockTransfersResult {
  transfers: StockTransferSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  /** The filter's options. Empty when the user cannot read them. */
  warehouses: Warehouse[];
  query: StockTransfersQuery;
  loading: boolean;
  error: string | null;
  setQuery: (patch: Partial<StockTransfersQuery>) => void;
  refetch: () => void;
}

/**
 * The manual transfers, paged — one entry per transfer, not per ledger row.
 *
 * THE GROUPING IS THE SERVER'S, and that is the whole reason this hook calls
 * `listTransfers` rather than filtering the ledger. A transfer has no document,
 * so its rows are held together only by a correlation id; a page of rows grouped
 * in the browser would page ROWS, and one transfer straddling a page boundary
 * would be listed twice with half its lots each time.
 *
 * THE FILTER GOES TO THE SERVER for the same reason it does on every other list
 * here: a list pages at twenty, so narrowing in the browser would answer
 * "transfers involving Gudang Bazar" with "the ones that happened to be on page
 * 1".
 *
 * THE WAREHOUSE LOOKUP FAILS SOFTLY. A user may hold `stockMovements:read`
 * NARROWED TO THE SIGNED-IN USER'S OWN, like every other stock picker: the
 * server refuses an out-of-scope filter with a 403 and hides the rows anyway,
 * so offering one here could only produce that refusal. A courtesy over the
 * server's answer — `utils/accessScope.ts` says why.
 *
 * without `warehouses:read`, and a list that refused to render because a
 * dropdown could not be populated would withhold the rows over the filter.
 */
export function useStockTransfers(): UseStockTransfersResult {
  const { user } = useAuth();
  const [transfers, setTransfers] = useState<StockTransferSummary[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const [query, setQueryState] = useState<StockTransfersQuery>(DEFAULT_QUERY);
  // Only the text field earns a wait; a changed dropdown is a finished decision.
  const debounced = useDebouncedQuery(query);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  /**
   * ANY FILTER CHANGE RESETS TO PAGE 1 — unless the change IS the page. Staying
   * on page 4 of a narrower result is how a screen answers a fresh question with
   * an empty table.
   */
  const setQuery = useCallback((patch: Partial<StockTransfersQuery>) => {
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
        if (active) setWarehouses(accessibleWarehouses(user, result.items));
      })
      .catch(() => {
        // Soft: see the header. The list still renders without its filter.
        if (active) setWarehouses([]);
      });

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    stockMovementService
      .listTransfers({
        page: debounced.page,
        limit: LIMIT,
        search: debounced.search.trim() || undefined,
        warehouseId: debounced.warehouseId || undefined,
        sort: debounced.sort,
      })
      .then((result) => {
        if (!active) return;
        setTransfers(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setTransfers([]);
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
    debounced.page,
    debounced.search,
    debounced.warehouseId,
    debounced.sort,
    nonce,
  ]);

  return {
    transfers,
    pagination,
    warehouses,
    query,
    loading,
    error,
    setQuery,
    refetch,
  };
}
