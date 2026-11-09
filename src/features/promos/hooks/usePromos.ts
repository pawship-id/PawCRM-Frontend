"use client";

import { useCallback, useEffect, useState } from "react";

import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";
import { ApiError } from "@/services/api-error";
import { promoService } from "@/services/promo.service";
import type { Promo, PromoListQuery, PromoListResponse } from "@/types/promo";

export const PROMO_PAGE_SIZE = 20;

type Query = PromoListQuery & { search: string };

const DEFAULT_QUERY: Query = { page: 1, limit: PROMO_PAGE_SIZE, search: "", sort: "newest" };

const EMPTY_COUNTS: PromoListResponse["counts"] = { running: 0, scheduled: 0, draft: 0, ended: 0 };

/**
 * A page of promos from GET /promos, with the per-status `counts` the strip
 * draws. The counts ignore the status filter (they are the strip's own), so
 * one request answers both. Search settles after typing stops.
 */
export function usePromos() {
  const [query, setQuery] = useState<Query>(DEFAULT_QUERY);
  const settled = useDebouncedQuery(query);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [counts, setCounts] = useState<PromoListResponse["counts"] | null>(null);
  const [pagination, setPagination] = useState<PromoListResponse["pagination"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    promoService
      .list({ ...settled, search: settled.search || undefined })
      .then((result) => {
        if (!active) return;
        setPromos(result.items);
        setCounts(result.counts ?? EMPTY_COUNTS);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setPromos([]);
        setPagination(null);
        setError(err instanceof ApiError ? err.fullMessage : "Gagal memuat promo. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settled, nonce]);

  /** Any filter change returns to page 1 (see useMembershipPlans). */
  const patchQuery = useCallback((patch: Partial<Query>) => {
    setQuery((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  }, []);

  return { promos, counts, pagination, loading, error, query, patchQuery, reload };
}
