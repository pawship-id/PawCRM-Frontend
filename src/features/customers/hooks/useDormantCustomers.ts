"use client";

import { useCallback, useEffect, useState } from "react";

import { customerService } from "@/services/customer.service";
import { ApiError } from "@/services/api-error";
import type { DormantCustomer, PageResult } from "@/types/api";

export interface DormantCustomersQuery {
  days: number;
  page: number;
}

const DEFAULT_DAYS = 60;
const LIMIT = 20;

const DEFAULT_QUERY: DormantCustomersQuery = {
  days: DEFAULT_DAYS,
  page: 1,
};

/** Empty page so the screen can render a table shell before the first load. */
const EMPTY_PAGE: PageResult<never>["pagination"] = {
  page: 1,
  limit: LIMIT,
  total: 0,
  totalPages: 0,
};

interface UseDormantCustomersResult {
  items: DormantCustomer[];
  pagination: PageResult<never>["pagination"];
  query: DormantCustomersQuery;
  loading: boolean;
  error: string | null;
  setQuery: (patch: Partial<DormantCustomersQuery>) => void;
  refetch: () => void;
}

/**
 * Every customer whose last settled sale (or, lacking one, whose
 * registration) is older than `days`, paged — the "Lihat semua" the
 * Ringkasan tab's `DormantPanel` links out to.
 *
 * `initial` SEEDS `days` FROM THE RINGKASAN CARD'S OWN `FilterSelect`, the
 * same lazy-`useState` merge `useCustomers`/`useCashTransactions` use for
 * their own deep links — see `dormant/page.tsx`. A reader who had widened
 * the panel to "≥ 120 hari" before clicking "Lihat semua" lands on a list
 * narrowed the same way, not reset to the default 60.
 *
 * A CHANGED `days` RESETS TO PAGE 1, same reason every other list here does:
 * staying on page 3 of a widened or narrowed window answers a different
 * question with whatever happens to be on that page.
 */
export function useDormantCustomers(
  initial: Partial<DormantCustomersQuery> = {},
): UseDormantCustomersResult {
  const [query, setQueryState] = useState<DormantCustomersQuery>(() => ({
    ...DEFAULT_QUERY,
    ...initial,
  }));
  const [items, setItems] = useState<DormantCustomer[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<never>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const setQuery = useCallback((patch: Partial<DormantCustomersQuery>) => {
    setQueryState((prev) => ({ ...prev, ...patch, page: patch.page ?? 1 }));
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    customerService
      .dormant({ days: query.days, page: query.page, limit: LIMIT })
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setItems([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Daftar pelanggan tidak aktif gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query.days, query.page, nonce]);

  return { items, pagination, query, loading, error, setQuery, refetch };
}
