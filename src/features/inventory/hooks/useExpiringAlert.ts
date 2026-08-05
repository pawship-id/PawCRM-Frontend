"use client";

import { useEffect, useState } from "react";

import { productBatchService } from "@/services/productBatch.service";
import { ApiError } from "@/services/api-error";
import type { ProductBatch } from "@/types/inventory";

interface UseExpiringAlertResult {
  /** The closest few to expiring — already-expired lots first. */
  items: ProductBatch[];
  /** Every lot inside the horizon, not just the ones listed. */
  total: number;
  /** Echoed by the API so the caption need not hardcode its own number. */
  withinDays: number;
  loading: boolean;
  error: string | null;
}

/**
 * The top of `GET /product-batches/expiring`, for the hub's expiry list.
 *
 * THE ORDER IS THE SERVER'S and already the one this list wants: closest to
 * expiring first, with lots that are ALREADY past the date at the very top.
 * Stock that expired last week and is still sellable on a shelf is the most
 * urgent thing this module can report, so it is never folded in among the rows
 * that can wait a month.
 *
 * Five rows and a total, for the same reason as `useLowStockAlert`: this is the
 * "is there anything to do today" answer. The full report — every horizon, the
 * exhausted lots, the value at risk — is one click away at
 * /dashboard/inventory/batches, where there is room to read it properly.
 */
const LIMIT = 5;
const WITHIN_DAYS = 30;

export function useExpiringAlert(enabled: boolean): UseExpiringAlertResult {
  const [items, setItems] = useState<ProductBatch[]>([]);
  const [total, setTotal] = useState(0);
  const [withinDays, setWithinDays] = useState(WITHIN_DAYS);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No `productBatches:read` — the section is hidden rather than errored.
    if (!enabled) return;

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    productBatchService
      .expiring({ limit: LIMIT, withinDays: WITHIN_DAYS })
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setTotal(result.pagination.total);
        setWithinDays(result.withinDays);
      })
      .catch((err) => {
        if (!active) return;
        setItems([]);
        setTotal(0);
        setError(
          err instanceof ApiError
            ? err.message
            : "Daftar lot mendekati kedaluwarsa gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [enabled]);

  return { items, total, withinDays, loading, error };
}
