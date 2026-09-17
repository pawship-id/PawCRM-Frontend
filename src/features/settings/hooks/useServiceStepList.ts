"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import {
  businessLineService,
  type BusinessLine,
} from "@/services/businessLine.service";
import { serviceStepService } from "@/services/serviceStep.service";
import type { ServiceStep } from "@/types/api";

/** The API's page ceiling, asked for in full. */
const LIMIT = 100;

export interface UseServiceStepListResult {
  /** The tenant's business lines, by name. Empty while unreadable. */
  lines: BusinessLine[];
  linesLoading: boolean;
  linesError: string | null;
  /** Every step of every line, soft-deleted ones included, unsorted. */
  steps: ServiceStep[];
  loading: boolean;
  error: string | null;
  /** Re-read the steps — called after every write on the Tahapan screen. */
  refetch: () => void;
}

/**
 * The Tahapan screen's own copy of every line's list, and the lines to put
 * them under.
 *
 * NOT `useServiceSteps(lineId)`. That store is what a service's Tahapan card
 * reads, one line at a time, without deleted rows — it answers what may be
 * CHOSEN. This screen shows the bin and must draw the server's answer after a
 * write, so it keeps its own list and re-reads it; the screen then drops the
 * shared cache too (`invalidateServiceSteps`) so the card follows.
 *
 * ONE LOAD FOR EVERY LINE, deleted included, narrowed on the client — the same
 * bargain as `usePetOptionList`. The pills count every line at once, a line's
 * list is a handful of words, and a request per pill would make switching
 * slower than reading. Paged to `totalPages` because nothing promises a tenant
 * stays under one page.
 *
 * THE LINES ARE READ ONLY WITH `businessLines:read`, which GET /business-lines
 * asks for and `services:read` does not imply. Without it no request is sent —
 * a 403 painted across a settings page answers nothing — and the screen says
 * why it cannot draw pills.
 */
export function useServiceStepList(
  mayReadLines: boolean,
): UseServiceStepListResult {
  const [lines, setLines] = useState<BusinessLine[]>([]);
  const [linesLoading, setLinesLoading] = useState(mayReadLines);
  const [linesError, setLinesError] = useState<string | null>(null);

  const [steps, setSteps] = useState<ServiceStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  // Lines change on another screen, not this one: read once.
  useEffect(() => {
    if (!mayReadLines) return;
    let active = true;
    // The sanctioned fetch-effect shape this repo uses everywhere — the stale
    // response guard below is what makes the late setStates safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinesLoading(true);
    setLinesError(null);

    businessLineService
      .list({ limit: LIMIT })
      .then((result) => {
        if (!active) return;
        setLines(
          [...result.items].sort((a, b) => a.name.localeCompare(b.name, "id")),
        );
      })
      .catch(() => {
        if (!active) return;
        // Our own sentence, never the server's — the API answers in English.
        setLinesError("Daftar lini bisnis tidak bisa dimuat. Coba muat ulang.");
      })
      .finally(() => {
        if (active) setLinesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [mayReadLines]);

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

  return { lines, linesLoading, linesError, steps, loading, error, refetch };
}
