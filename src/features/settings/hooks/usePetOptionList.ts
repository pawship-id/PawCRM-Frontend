"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { petOptionService } from "@/services/petOption.service";
import type { PetOption } from "@/types/api";

/** The API's page ceiling, asked for in full. */
const LIMIT = 100;

interface UsePetOptionListResult {
  /** Every option of every type, soft-deleted ones included, unsorted. */
  options: PetOption[];
  loading: boolean;
  error: string | null;
  /** Re-read — called after every write on the Data hewan screen. */
  refetch: () => void;
}

/**
 * The Data hewan screen's own copy of the four lists.
 *
 * NOT `usePetOptions()`. That store is what every picker reads and it answers a
 * different question — what may be CHOSEN — from a cache that is loaded once.
 * This screen is the one place deleted rows are shown, and after a write it
 * must draw the server's answer rather than whatever the shared cache holds, so
 * it keeps its own list and re-reads it; the screen then drops the shared cache
 * too (`invalidatePetOptions`) so the pickers follow.
 *
 * ONE LOAD FOR ALL FOUR TYPES, deleted included, narrowed on the client. The
 * lists are a handful of words each, the pill counts need every type at once,
 * and a request per pill would make switching slower than reading. Paged to
 * `totalPages` because nothing promises a tenant stays under one page.
 */
export function usePetOptionList(): UsePetOptionListResult {
  const [options, setOptions] = useState<PetOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // The sanctioned fetch-effect shape this repo uses everywhere — the stale
    // response guard below is what makes the late setStates safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    (async () => {
      const items: PetOption[] = [];
      for (let page = 1; ; page += 1) {
        const result = await petOptionService.list({
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
        setOptions(items);
      })
      .catch((err) => {
        if (!active) return;
        // The last good list stays on screen: after a write, a failed re-read
        // should not blank the table the reader was working in.
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat data hewan. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [nonce]);

  return { options, loading, error, refetch };
}
