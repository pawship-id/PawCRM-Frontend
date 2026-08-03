"use client";

import { useEffect, useState } from "react";

import { productBatchService } from "@/services/productBatch.service";
import { ApiError } from "@/services/api-error";
import type { BatchExpirySummary } from "@/types/inventory";

interface UseBatchSummaryResult {
  summary: BatchExpirySummary | null;
  loading: boolean;
  error: string | null;
}

/**
 * The four tiles: how many lots are expired, critical and soon, and what they
 * are worth.
 *
 * A SEPARATE REQUEST FROM THE LIST, and not derivable from it. The counts span
 * every matching lot, not the twenty on screen — and `value` cannot be produced
 * client-side at all, because summing `qtyRemaining × costPerUnit` needs every
 * row. A screen that summed its page would show a "nilai berisiko" that grows
 * as the user pages, which is worse than showing nothing because it looks like a
 * total.
 *
 * KEYED ON THE WAREHOUSE ONLY. The horizon does not change these numbers — the
 * buckets are fixed at 7 and 30 days and are what the tiles are labelled with —
 * so re-fetching when the user switches horizon would be a wasted request per
 * click.
 */
export function useBatchSummary(
  warehouseId: string,
  refreshKey: number,
): UseBatchSummaryResult {
  const [summary, setSummary] = useState<BatchExpirySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    productBatchService
      .summary({ warehouseId: warehouseId || undefined })
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
            : "Ringkasan kedaluwarsa gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [warehouseId, refreshKey]);

  return { summary, loading, error };
}
