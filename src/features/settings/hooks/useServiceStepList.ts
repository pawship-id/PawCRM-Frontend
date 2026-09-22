"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { serviceStepService } from "@/services/serviceStep.service";
import type { ServiceStep } from "@/types/api";

/** The API's page ceiling, asked for in full. */
const LIMIT = 100;

export interface UseServiceStepListResult {
  /** Every step of every Kelompok layanan, soft-deleted ones included, unsorted. */
  steps: ServiceStep[];
  loading: boolean;
  error: string | null;
  /** Re-read the steps — called after every write on the Tahapan screen. */
  refetch: () => void;
}

/**
 * The Tahapan screen's own copy of every kind's list.
 *
 * NOT `useServiceSteps(kind)`. That store is what a service's Tahapan card
 * reads, one kind at a time, without deleted rows — it answers what may be
 * CHOSEN. This screen shows the bin and must draw the server's answer after a
 * write, so it keeps its own list and re-reads it; the screen then drops the
 * shared cache too (`invalidateServiceSteps`) so the card follows.
 *
 * ONE LOAD FOR EVERY KIND, deleted included, narrowed on the client — the pills
 * count every kind at once, and a kind's list is a handful of words. Paged to
 * `totalPages` because nothing promises a tenant stays under one page.
 *
 * NO BUSINESS LINES (22 September 2026): steps are grouped by the product's own
 * three kinds, so neither the lines nor the grant to read them are needed.
 */
export function useServiceStepList(): UseServiceStepListResult {
  const [steps, setSteps] = useState<ServiceStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    (async () => {
      const items: ServiceStep[] = [];
      for (let page = 1; ; page += 1) {
        const result = await serviceStepService.list({
          page,
          limit: LIMIT,
          includeDeleted: true,
        });
        items.push(...result.items);
        if (page >= result.pagination.totalPages) return items;
      }
    })()
      .then((items) => {
        if (!active) return;
        setSteps(items);
      })
      .catch((err) => {
        if (!active) return;
        // The last good list stays on screen: after a write, a failed re-read
        // should not blank the table the reader was working in.
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat tahapan. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [nonce]);

  return { steps, loading, error, refetch };
}
