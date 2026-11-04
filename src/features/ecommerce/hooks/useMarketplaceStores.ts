"use client";

import { useCallback, useEffect, useState } from "react";

import { marketplaceService } from "@/services/marketplace.service";
import type { MarketplaceStore } from "@/types/marketplace";

/**
 * Every connected store of the tenant, with its listing counts. A shop rarely
 * has more than a handful, so there is no paging; every E-commerce screen
 * reads this list for its store picker.
 */
export function useMarketplaceStores() {
  const [stores, setStores] = useState<MarketplaceStore[]>([]);
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
      .listStores()
      .then((result) => {
        if (!active) return;
        setStores(result);
        setError(null);
      })
      .catch(() => {
        if (active) setError("Daftar toko tidak bisa dimuat. Coba muat ulang halaman.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [nonce]);

  return { stores, loading, error, refetch };
}
