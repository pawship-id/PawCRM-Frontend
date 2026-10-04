"use client";

import { useEffect, useState } from "react";

import { reportService } from "@/services/report.service";
import { ApiError } from "@/services/api-error";
import type { ProductMovementReport } from "@/types/report";

/** Rows each list shows. A glance widget, not a report. */
const LIMIT = 5;

/** The ranking's window. Fixed, because a ranking is only comparable to itself. */
export const TOP_SELLER_DAYS = 30;

/** What the idle list's own select offers, matching the mockup. */
export const IDLE_DAY_OPTIONS = [30, 60, 90] as const;

interface UseProductMovementResult {
  data: ProductMovementReport | null;
  loading: boolean;
  error: string | null;
}

/**
 * The hub's two movement lists: what sold most in 30 days, and what has not
 * sold at all in the window the reader picked.
 *
 * ONE REQUEST FOR BOTH, because the server computes them together — a slow
 * mover is defined as a product absent from the sold set, and two calls could
 * disagree about a sale made between them. See `ProductMovementReport`.
 *
 * NOTHING IS RANKED OR SUBTRACTED HERE. The units are netted of voids and the
 * idle set is subtracted in the database; this hook holds three states and a
 * request.
 */
export function useProductMovement(
  /** Skip the request when the role cannot read products. */
  enabled: boolean,
  /** Empty means every gudang the caller may reach. */
  warehouseId: string,
  /** Empty means every cabang; resolved server-side into its gudang. */
  branchId: string,
  idleDays: number,
): UseProductMovementResult {
  const [data, setData] = useState<ProductMovementReport | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The caller holds no `products:read`. Asking anyway would paint a 403
    // across a landing page for a section the user is simply not shown.
    if (!enabled) return;

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    reportService
      .productMovement({
        warehouseId,
        branchId,
        days: TOP_SELLER_DAYS,
        idleDays,
        limit: LIMIT,
      })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (!active) return;
        setData(null);
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat pergerakan produk. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [enabled, warehouseId, branchId, idleDays]);

  return { data, loading, error };
}
