"use client";

import { useCallback, useEffect, useState } from "react";

import { marketplaceService } from "@/services/marketplace.service";
import type { PageResult } from "@/types/api";
import type { MarketplaceHistoryEntry } from "@/types/marketplace";

const PAGE_SIZE = 10;

/** Riwayat — every template upload and stock export, newest first. */
export function useMarketplaceHistory() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PageResult<MarketplaceHistoryEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // Loading state before the request; the `active` guard makes the late
    // setStates safe — the sanctioned fetch-effect shape (see useWarehouses).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    marketplaceService
      .listHistory({ page, limit: PAGE_SIZE })
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
  }, [page, nonce]);

  return {
    entries: result?.items ?? [],
    pagination: result?.pagination ?? { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
    loading,
    error,
    setPage,
    refetch,
  };
}
