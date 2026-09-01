"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { productService } from "@/services/product.service";
import { warehouseService } from "@/services/warehouse.service";
import type { NegativeStockRow } from "@/types/inventory";
import type { Warehouse } from "@/types/api";
import { useAuth } from "@/features/auth";
import { accessibleWarehouses } from "@/utils/accessScope";

/** The one knob this list offers, plus the page. */
export interface NegativeStockQuery {
  /** Empty means every warehouse in reach. */
  warehouseId: string;
  page: number;
}

const DEFAULT_QUERY: NegativeStockQuery = { warehouseId: "", page: 1 };

const LIMIT = 20;

export interface UseNegativeStockResult {
  items: NegativeStockRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  /** What the WHOLE hole is worth, across every row — not this page's. */
  shortfall: string | null;
  /** The filter's options. Empty when the user cannot read them. */
  warehouses: Warehouse[];
  query: NegativeStockQuery;
  loading: boolean;
  error: string | null;
  setQuery: (patch: Partial<NegativeStockQuery>) => void;
  refetch: () => void;
}

/**
 * Every shelf that owes what it has already sold, paged.
 *
 * THE HUB SHOWS FIVE; THIS SHOWS ALL OF THEM. The card on the landing page
 * answers "is there anything wrong" and this answers "what, exactly" — which is
 * a different job: a shop clearing a backlog works down a list, and a list that
 * stops at five is one somebody has to guess the rest of.
 *
 * NO SEARCH, and that is not an omission. The API narrows by warehouse and
 * nothing else, so a search box would either lie (filtering one page of twenty
 * in the browser) or need a server field nobody has asked for. Twenty rows below
 * zero is already an unusual amount of wrong.
 *
 * NO SORT EITHER. The order is fixed at worst-first BY VALUE, which is the only
 * order this list is read in: the −200 sacks of feed matter and the −1 collar
 * does not, and offering "by name" would be offering a way to hide the
 * expensive rows below the fold.
 *
 * THE WAREHOUSE LOOKUP FAILS SOFTLY, like every other stock picker here: a user
 * may hold `products:read` without `warehouses:read`, and a list that refused to
 * render because a dropdown could not be filled would withhold the rows over the
 * filter. See `utils/accessScope.ts`.
 */
export function useNegativeStock(): UseNegativeStockResult {
  const { user } = useAuth();
  const [items, setItems] = useState<NegativeStockRow[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [shortfall, setShortfall] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const [query, setQueryState] = useState<NegativeStockQuery>(DEFAULT_QUERY);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  /**
   * A CHANGED FILTER RESETS TO PAGE 1 — unless the change IS the page. Staying
   * on page 3 of a narrower result answers a fresh question with an empty table.
   */
  const setQuery = useCallback((patch: Partial<NegativeStockQuery>) => {
    setQueryState((prev) => ({ ...prev, ...patch, page: patch.page ?? 1 }));
  }, []);

  useEffect(() => {
    let active = true;

    warehouseService
      .list({ limit: 100 })
      .then((result) => {
        if (active) setWarehouses(accessibleWarehouses(user, result.items));
      })
      .catch(() => {
        // Soft: see the header. The list still renders without its filter.
        if (active) setWarehouses([]);
      });

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    productService
      .negativeStock({
        page: query.page,
        limit: LIMIT,
        // `|| undefined` so "every warehouse" drops out of the query string
        // rather than reaching the API as an empty string it refuses as a 400.
        warehouseId: query.warehouseId || undefined,
      })
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setPagination(result.pagination);
        setShortfall(result.shortfall);
      })
      .catch((err) => {
        if (!active) return;
        setItems([]);
        setShortfall(null);
        setError(
          err instanceof ApiError
            ? err.message
            : "Daftar stok minus gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query.page, query.warehouseId, nonce]);

  return {
    items,
    pagination,
    shortfall,
    warehouses,
    query,
    loading,
    error,
    setQuery,
    refetch,
  };
}
