"use client";

import { useEffect, useState } from "react";

import { stockMovementService } from "@/services/stockMovement.service";
import { ApiError } from "@/services/api-error";
import type { StockMovementSummary } from "@/types/inventory";

import type { StockCardFilters } from "./useStockCard";

interface UseStockCardSummaryResult {
  summary: StockMovementSummary | null;
  loading: boolean;
  error: string | null;
}

/**
 * What moved in the selected period: total in, total out, nett, and how many
 * movements.
 *
 * A SEPARATE REQUEST FROM THE LEDGER, and not derivable from it. The list is one
 * page of fifty; these totals span every row the filters match. Summing the page
 * would produce a "total keluar" that grows as the user pages — worse than no
 * number, because it looks like a total. That is exactly what this screen did
 * before the endpoint existed (PawCRM-Backend 0.20.0), by omitting the tiles.
 *
 * Deliberately NOT keyed on the page number: the totals do not change when the
 * user pages, so re-fetching them on every page turn would be one wasted request
 * per click. It re-runs on a filter change and on `refreshKey`, which is exactly
 * when the answer can differ.
 */
export function useStockCardSummary(
  filters: StockCardFilters,
  refreshKey: number,
): UseStockCardSummaryResult {
  const [summary, setSummary] = useState<StockMovementSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { productId, warehouseId, movementType, from, to } = filters;

  useEffect(() => {
    if (!productId || !warehouseId) return;

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    stockMovementService
      .summary({
        productId,
        warehouseId,
        movementType: movementType || undefined,
        from: from ? `${from}T00:00:00.000Z` : undefined,
        to: to ? `${to}T23:59:59.999Z` : undefined,
      })
      .then((result) => {
        if (!active) return;
        setSummary(result);
      })
      .catch((err) => {
        if (!active) return;
        setSummary(null);
        setError(
          err instanceof ApiError
            ? err.message
            : "Ringkasan periode gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [productId, warehouseId, movementType, from, to, refreshKey]);

  return { summary, loading, error };
}
