"use client";

import { useCallback, useEffect, useState } from "react";

import { usePersistentState } from "@/hooks/usePersistentState";

import { DEFAULT_PAGE_SIZE } from "@/components";
import { marketplaceService } from "@/services/marketplace.service";
import type { PageResult } from "@/types/api";
import type { MarketplaceHistoryEntry } from "@/types/marketplace";

/** Riwayat — every template upload and stock export, newest first. */
export function useMarketplaceHistory() {
  const [page, setPage] = usePersistentState("ecommerce.history.page", 1);
  const [limit, setLimitState] = usePersistentState(
    "ecommerce.history.pageSize",
    DEFAULT_PAGE_SIZE,
  );
  const [result, setResult] = useState<PageResult<MarketplaceHistoryEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const setLimit = useCallback((next: number) => {
    setLimitState(next);
    setPage(1);
  }, [setLimitState, setPage]);

  useEffect(() => {
    let active = true;
    // Loading state before the request; the `active` guard makes the late
    // setStates safe — the sanctioned fetch-effect shape (see useWarehouses).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    marketplaceService
      .listHistory({ page, limit })
      .then((next) => {
        if (!active) return;
        setResult(next);
        setError(null);
      })
      .catch(() => {
        if (active) setError("Riwayat tidak bisa dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, limit, nonce]);

  return {
    entries: result?.items ?? [],
    pagination: result?.pagination ?? { page, limit, total: 0, totalPages: 0 },
    loading,
    error,
    limit,
    setPage,
    setLimit,
    refetch,
  };
}
