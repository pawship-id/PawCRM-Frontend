"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { reportService } from "@/services/report.service";
import type { StockOnHandQuery, StockOnHandResult } from "@/types/report";

interface UseStockOnHandResult {
  data: StockOnHandResult | null;
  loading: boolean;
  error: string | null;
  /** Re-runs the current query — for a retry button. */
  refresh: () => void;
}

/**
 * `GET /reports/stock-on-hand`, paged and filtered.
 *
 * THE PREVIOUS PAGE IS KEPT ON SCREEN while the next one loads, rather than
 * blanking to a spinner. A report is read by scrolling and paging, and a table
 * that empties on every click is one the reader loses their place in — the
 * loading flag dims it instead.
 *
 * `query` is spread into the dependency list field by field rather than passed
 * as an object, because an object literal from the caller is a new reference on
 * every render and would refetch forever.
 */
export function useStockOnHand(query: StockOnHandQuery): UseStockOnHandResult {
  const [data, setData] = useState<StockOnHandResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const { page, limit, warehouseId, branchId, categoryId, includeZero } = query;

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    reportService
      .stockOnHand({
        page,
        limit,
        warehouseId,
        branchId,
        categoryId,
        includeZero,
      })
      .then((result) => {
        if (!active) return;
        setData(result);
      })
      .catch((err) => {
        if (!active) return;
        /**
         * The filter errors are the ones worth passing through verbatim. The API
         * refuses a warehouse or category that does not exist rather than
         * reporting zero rows, and its message names which — repeating that here
         * as "Gagal memuat" would throw away the only useful part.
         */
        setError(
          err instanceof ApiError ? err.message : "Laporan gagal dimuat.",
        );
        setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, limit, warehouseId, branchId, categoryId, includeZero, nonce]);

  return { data, loading, error, refresh };
}
