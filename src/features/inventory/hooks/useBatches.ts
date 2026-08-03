"use client";

import { useCallback, useEffect, useState } from "react";

import { productBatchService } from "@/services/productBatch.service";
import { ApiError } from "@/services/api-error";
import type { PageResult } from "@/types/api";
import type { ProductBatch } from "@/types/inventory";

/**
 * How far ahead to look. `all` is not a horizon — it switches the screen from
 * the alert list to the whole collection, which is a different endpoint and a
 * different question.
 */
export type Horizon = "7" | "30" | "90" | "all";

export interface BatchesQuery {
  /** "" = every warehouse. */
  warehouseId: string;
  horizon: Horizon;
  /** Audit mode only: exhausted lots are history, not an alert. */
  includeSpent: boolean;
  /** A batch code. Forces the audit endpoint — see below. */
  search: string;
}

export const DEFAULT_BATCHES_QUERY: BatchesQuery = {
  warehouseId: "",
  // 30 days is the API's own default horizon, and the number the "perhatian"
  // tile is labelled with.
  horizon: "30",
  includeSpent: false,
  search: "",
};

const PAGE_SIZE = 20;

const EMPTY_PAGINATION: PageResult<ProductBatch>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

interface UseBatchesResult {
  batches: ProductBatch[];
  pagination: PageResult<ProductBatch>["pagination"];
  /** True while the ALERT endpoint is answering — the audit list says otherwise. */
  alertMode: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * The lot list, from whichever of the two endpoints answers the question asked.
 *
 * TWO ENDPOINTS, TWO QUESTIONS, and forcing them into one list would make one of
 * them lie:
 *
 *   `/expiring`        — "what is about to go bad". Live lots that HAVE a date,
 *                        cumulative (30 days includes the already-expired), and
 *                        the report a Monday morning starts with.
 *   `/product-batches` — "what lots exist". Includes exhausted ones and the
 *                        consignment lots that never expire, which the alert
 *                        endpoint deliberately drops.
 *
 * The `includeSpent` toggle only means anything in audit mode: an exhausted lot
 * cannot expire into anything a human has to act on, so the alert endpoint has
 * no opinion to offer about it.
 *
 * A SEARCH FORCES AUDIT MODE. `/expiring` cannot filter by batch code, and
 * "trace lot WSK-B26-0640" is a question about a lot's whole life — including
 * after it sold out. The screen shows that the horizon is suspended rather than
 * silently returning results from a set the user did not pick.
 */
export function useBatches(
  query: BatchesQuery,
  page: number,
  refreshKey: number,
): UseBatchesResult {
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<ProductBatch>["pagination"]>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { warehouseId, horizon, includeSpent, search } = query;
  const alertMode = horizon !== "all" && search.trim() === "";

  const fetchPage = useCallback(() => {
    if (alertMode) {
      return productBatchService.expiring({
        page,
        limit: PAGE_SIZE,
        warehouseId: warehouseId || undefined,
        withinDays: Number(horizon),
      });
    }

    return productBatchService.list({
      page,
      limit: PAGE_SIZE,
      warehouseId: warehouseId || undefined,
      search: search.trim() || undefined,
      // Tri-state: `undefined` returns exhausted lots too, which is what the
      // toggle asks for. `true` is the narrower question.
      hasRemaining: includeSpent ? undefined : true,
    });
  }, [alertMode, page, warehouseId, horizon, includeSpent, search]);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    fetchPage()
      .then((result) => {
        if (!active) return;
        setBatches(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setBatches([]);
        setPagination(EMPTY_PAGINATION);
        setError(
          err instanceof ApiError ? err.message : "Daftar lot gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fetchPage, refreshKey]);

  return { batches, pagination, alertMode, loading, error };
}
