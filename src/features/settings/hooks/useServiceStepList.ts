"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { serviceStepService } from "@/services/serviceStep.service";
import type { ServiceStep } from "@/types/api";

/** The API's page ceiling, asked for in full. */
const LIMIT = 100;

export interface UseServiceStepListResult {
  /** Every step, soft-deleted ones included, unsorted. */
  steps: ServiceStep[];
  loading: boolean;
  error: string | null;
  /** Re-read the steps — called after every write on the Tahapan screen. */
  refetch: () => void;
}

/**
 * The Tahapan screen's own copy of the list.
 *
 * NOT `useServiceSteps()`. That store is what a service's Tahapan card reads,
 * without deleted rows — it answers what may be CHOSEN. This screen shows the
 * bin and must draw the server's answer after a write, so it keeps its own list
 * and re-reads it; the screen then drops the shared cache too
 * (`invalidateServiceSteps`) so the card follows.
 *
 * ONE LIST PER TENANT (22 September 2026), deleted included. Paged to
 * `totalPages` because nothing promises a tenant stays under one page.
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
