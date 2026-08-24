"use client";

import { useCallback, useEffect, useState } from "react";

import { productBatchService } from "@/services/productBatch.service";
import { ApiError } from "@/services/api-error";
import type { PageResult } from "@/types/api";
import type { BatchSort, ProductBatch } from "@/types/inventory";

/**
 * How far ahead to look.
 *
 * TWO OF THESE ARE NOT HORIZONS. `all` switches the screen from the alert list
 * to the whole collection, and `custom` hands the window over to two dates the
 * user picks — both are a different endpoint and a different question, which is
 * why they sit in the same control: from where somebody stands they are all
 * answers to "which lots do I want to see".
 */
export type Horizon = "7" | "30" | "90" | "all" | "custom";

export interface BatchesQuery {
  /**
   * "" = every branch.
   *
   * A lot has no branch of its own: it belongs to a warehouse, and the API
   * resolves this to the warehouses under the branch — its own, plus the shared
   * central ones. Sent alongside `warehouseId` the two intersect, which is why
   * the panel keeps the pair consistent rather than letting either stand alone.
   */
  branchId: string;
  /** "" = every warehouse. */
  warehouseId: string;
  horizon: Horizon;
  /** Audit mode only: exhausted lots are history, not an alert. */
  includeSpent: boolean;
  /** A batch code, a product name or an SKU. Forces the audit endpoint. */
  search: string;
  /**
   * The `custom` horizon's own window, as ISO `yyyy-mm-dd`, or "" when unset.
   *
   * KEPT WHILE ANOTHER HORIZON IS SELECTED rather than cleared, so flipping to
   * "30 hari" to check something and back does not make the user retype two
   * dates. Only `horizon === "custom"` sends them.
   *
   * Either bound alone is a legitimate question — "everything expiring after
   * March" is one — so neither waits for the other.
   */
  expiryFrom: string;
  expiryTo: string;
  /**
   * Which ordering to page through. ONE CONTROL FOR BOTH ENDPOINTS: the two
   * answer different questions but return the same rows, and a sort that
   * silently reset when a search flipped the screen into audit mode would be a
   * control that undoes itself.
   */
  sort: BatchSort;
}

export const DEFAULT_BATCHES_QUERY: BatchesQuery = {
  branchId: "",
  warehouseId: "",
  // 30 days is the API's own default horizon, and the number the "perhatian"
  // tile is labelled with.
  horizon: "30",
  includeSpent: false,
  search: "",
  expiryFrom: "",
  expiryTo: "",
  // The API's own default on both endpoints — and the order this screen exists
  // to show: what goes bad first, first.
  sort: "expirySoonest",
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
 * A SEARCH FORCES AUDIT MODE. `/expiring` cannot filter by anything but a
 * warehouse and a horizon, and "trace lot WSK-B26-0640" — or "which lots of
 * Royal Canin 3kg are left" — is a question about a product's whole life,
 * including after it sold out. The screen shows that the horizon is suspended
 * rather than silently returning results from a set the user did not pick.
 *
 * A CUSTOM RANGE FORCES IT TOO, for the same reason: `/expiring` takes a
 * `withinDays` counted from today and has no way to express "November", let
 * alone a window that has already closed. The audit endpoint's `expiryFrom` /
 * `expiryTo` do — and they exclude undated lots on their own, which is what
 * makes the swap invisible on a screen about expiry.
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

  const { branchId, warehouseId, horizon, includeSpent, search, sort } = query;
  const custom = horizon === "custom";
  // `expiring` answers a horizon counted from today and nothing else — so the
  // two questions it cannot express, a search and a hand-picked window, are the
  // two that switch endpoints.
  const alertMode = horizon !== "all" && !custom && search.trim() === "";
  const expiryFrom = custom ? query.expiryFrom : "";
  const expiryTo = custom ? query.expiryTo : "";

  const fetchPage = useCallback(() => {
    if (alertMode) {
      return productBatchService.expiring({
        page,
        limit: PAGE_SIZE,
        branchId: branchId || undefined,
        warehouseId: warehouseId || undefined,
        withinDays: Number(horizon),
        sort,
      });
    }

    return productBatchService.list({
      page,
      limit: PAGE_SIZE,
      // BOTH ENDPOINTS TAKE IT, so the filter survives the swap the horizon
      // makes — one that applied to the alert list and not the audit list would
      // silently widen the rows the moment somebody searched.
      branchId: branchId || undefined,
      warehouseId: warehouseId || undefined,
      search: search.trim() || undefined,
      // Bare dates: the API takes the upper bound as the END of the day it
      // names, so a lot expiring during it is not silently dropped.
      expiryFrom: expiryFrom || undefined,
      expiryTo: expiryTo || undefined,
      // Tri-state: `undefined` returns exhausted lots too, which is what the
      // toggle asks for. `true` is the narrower question.
      hasRemaining: includeSpent ? undefined : true,
      sort,
    });
  }, [
    alertMode,
    page,
    branchId,
    warehouseId,
    horizon,
    includeSpent,
    search,
    sort,
    expiryFrom,
    expiryTo,
  ]);

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
          err instanceof ApiError ? err.message : "Daftar batch gagal dimuat.",
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
