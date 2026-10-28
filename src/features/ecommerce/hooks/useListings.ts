"use client";

import { useCallback, useEffect, useState } from "react";

import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";
import { marketplaceService } from "@/services/marketplace.service";
import type { ListingPage, ListingStatus, MarketplaceListing } from "@/types/marketplace";

export interface ListingsQuery {
  page: number;
  limit: number;
  search: string;
  status: ListingStatus | "";
}

const DEFAULT_QUERY: ListingsQuery = { page: 1, limit: 50, search: "", status: "" };

/**
 * One store's Shopee variations — Pengikatan SKU's table. Search is debounced;
 * any change other than the page goes back to page 1. `replaceListing` folds a
 * bind/unbind answer into the rows in place, and `refetch` reloads when the
 * change reached rows other than the one clicked (a SKU on several listings).
 */
export function useListings(storeId: string | null) {
  const [query, setQueryState] = useState<ListingsQuery>(DEFAULT_QUERY);
  const [page, setPageData] = useState<ListingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<ListingsQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const replaceListing = useCallback((listing: MarketplaceListing) => {
    setPageData((prev) =>
      prev
        ? { ...prev, items: prev.items.map((item) => (item._id === listing._id ? listing : item)) }
        : prev,
    );
  }, []);

  useEffect(() => {
    if (!storeId) {
      // No store, nothing to fetch — the sanctioned fetch-effect shape (see
      // useWarehouses); the `active` guard below makes the late setStates safe.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPageData(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    marketplaceService
      .listListings(storeId, settled)
      .then((next) => {
        if (!active) return;
        setPageData(next);
        setError(null);
      })
      .catch(() => {
        if (active) setError("Daftar varian Shopee tidak bisa dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [storeId, settled, nonce]);

  return {
    listings: page?.items ?? [],
    counts: page?.counts ?? null,
    pagination: page?.pagination ?? { page: 1, limit: query.limit, total: 0, totalPages: 0 },
    query,
    setQuery,
    loading,
    error,
    refetch,
    replaceListing,
  };
}
