"use client";

import { useCallback, useEffect, useState } from "react";

import { businessLineService } from "@/services/businessLine.service";
import type { BusinessLine } from "@/services/businessLine.service";
import { ApiError } from "@/services/api-error";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/** The only knob this list has. A tenant runs a handful of lines, not a catalogue. */
export interface BusinessLinesQuery {
  search: string;
}

const DEFAULT_QUERY: BusinessLinesQuery = { search: "" };

/**
 * The API's page cap, requested in full.
 *
 * NO PAGINATION HERE, deliberately. A line of business is a unit the owner runs
 * — grooming, penitipan, retail — and a shop with more than a page of them has a
 * different problem than paging. Asking for all of them keeps the screen a list
 * somebody reads top to bottom, which is also what makes "is this name already
 * taken" answerable by looking.
 */
const LIMIT = 100;

interface UseBusinessLinesResult {
  lines: BusinessLine[];
  /** How many the API says exist, for the count under the table. */
  total: number;
  query: BusinessLinesQuery;
  loading: boolean;
  error: string | null;
  setQuery: (patch: Partial<BusinessLinesQuery>) => void;
  /** Re-run the query — called after a create, rename or delete. */
  refetch: () => void;
}

/**
 * Owns the business-line list query and its fetching.
 *
 * Same shape as useCategories: local state, a fetch effect keyed on the settled
 * query, and an explicit `refetch` the mutations call.
 *
 * SHARED WITH THE CHART OF ACCOUNTS, which reads it to fill its picker and to
 * label its column. That caller ignores `search` and takes the whole list, which
 * is exactly what the default query gives it.
 */
export function useBusinessLines(): UseBusinessLinesResult {
  const [query, setQueryState] = useState<BusinessLinesQuery>(DEFAULT_QUERY);
  const [lines, setLines] = useState<BusinessLine[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // The toolbar holds the live value so typing stays responsive; only the
  // request waits for the search box to settle.
  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<BusinessLinesQuery>) => {
    setQueryState((prev) => ({ ...prev, ...patch }));
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // The sanctioned fetch-effect shape this repo uses everywhere — the stale
    // response guard below is what makes the late setStates safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    businessLineService
      .list({ limit: LIMIT, search: settled.search.trim() || undefined })
      .then((result) => {
        if (!active) return;
        setLines(result.items);
        setTotal(result.pagination.total);
      })
      .catch((err) => {
        if (!active) return;
        setLines([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Gagal memuat lini bisnis. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settled, nonce]);

  return { lines, total, query, loading, error, setQuery, refetch };
}
