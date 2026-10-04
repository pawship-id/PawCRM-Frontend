"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { zoneService } from "@/services/zone.service";
import type { Zone } from "@/types/api";

/** The API's page ceiling, asked for in full. */
const LIMIT = 100;

export interface UseZoneListResult {
  /** Every zone, soft-deleted ones included, nearest first. */
  zones: Zone[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * The Zona section's list — one load, deleted included, narrowed on the client,
 * on `usePetOptionList`'s bargain: a tenant has a handful of zones, and the rail
 * counts them. Paged to `totalPages` all the same.
 */
export function useZoneList(): UseZoneListResult {
  const [zones, setZones] = useState<Zone[]>([]);
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
      const items: Zone[] = [];
      for (let page = 1; ; page += 1) {
        const result = await zoneService.list({ page, limit: LIMIT, includeDeleted: true });
        items.push(...result.items);
        if (page >= result.pagination.totalPages) return items;
      }
    })()
      .then((items) => {
        if (!active) return;
        setZones(items);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.fullMessage : "Gagal memuat zona. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [nonce]);

  return { zones, loading, error, refetch };
}
