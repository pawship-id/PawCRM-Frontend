"use client";

import { useEffect, useState } from "react";

import { productBatchService } from "@/services/productBatch.service";
import { ApiError } from "@/services/api-error";
import type { ProductBatch } from "@/types/inventory";

/**
 * A hundred lots. One product at one warehouse holds a lot per receipt, so this
 * covers years of trading; `total` tells the table when it did not.
 */
const LIMIT = 100;

interface UseProductBatchesResult {
  /** Closest-to-expiring first — the API's own order, which is FEFO order. */
  batches: ProductBatch[];
  /** How many lots exist. Larger than `batches.length` means the list is cut. */
  total: number;
  loading: boolean;
  error: string | null;
}

/**
 * The lots of one product at one warehouse — the stock card's second tab.
 *
 * `hasRemaining` IS DELIBERATELY NOT SENT. Exhausted lots come back too, and the
 * table sorts them to the bottom as history: a quantity is never deleted, only
 * driven to zero, and tracing where stock went means reading the lot that has
 * none left. Filtering them out here would make that impossible from the one
 * screen built for it.
 *
 * Separate from useStockCard rather than folded into it because the two tabs
 * answer different questions from different endpoints — the ledger says what
 * happened, the lots say what is on the shelf right now. A discrepancy between
 * them is itself the useful signal, which requires that neither is derived from
 * the other.
 *
 * Shares `refreshKey` with the ledger so both tabs re-read together; a user who
 * refreshes because a number looks wrong gets two consistent answers, not one
 * fresh tab and one stale one.
 */
export function useProductBatches(
  productId: string,
  warehouseId: string,
  refreshKey: number,
): UseProductBatchesResult {
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId || !warehouseId) {
      return;
    }

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    productBatchService
      .list({ productId, warehouseId, limit: LIMIT })
      .then((result) => {
        if (!active) return;
        setBatches(result.items);
        setTotal(result.pagination.total);
      })
      .catch((err) => {
        if (!active) return;
        setBatches([]);
        setTotal(0);
        setError(
          err instanceof ApiError ? err.message : "Daftar batch gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [productId, warehouseId, refreshKey]);

  return { batches, total, loading, error };
}
