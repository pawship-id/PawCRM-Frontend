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
 * KEYED ON THE PLACE ONLY — the branch and the warehouse. The horizon does not
 * change these numbers — the buckets are fixed at 7 and 30 days and are what the
 * tiles are labelled with — so re-fetching when the user switches horizon would
 * be a wasted request per click.
 *
 * IT DOES TAKE THE BRANCH, though, because that DOES change them: tiles counting
 * a wider set than the rows beneath them is a total nobody can reconcile against
 * what they can see.
 */
export function useBatchSummary(
  branchId: string,
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
      .summary({
        branchId: branchId || undefined,
        warehouseId: warehouseId || undefined,
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
            : "Ringkasan kedaluwarsa gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [branchId, warehouseId, refreshKey]);

  return { summary, loading, error };
}
