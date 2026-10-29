"use client";

import { useCallback, useEffect, useState } from "react";

import { marketplaceService } from "@/services/marketplace.service";
import type { MarketplaceOrderRecord } from "@/types/marketplace";

/** Ringkasan's two order lists: held orders and Perlu tindakan, every store. */
export function useMarketplaceOrders() {
  const [held, setHeld] = useState<MarketplaceOrderRecord[]>([]);
  const [needsAction, setNeedsAction] = useState<MarketplaceOrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // Loading state before the request; the `active` guard makes the late
    // setStates safe — the sanctioned fetch-effect shape (see useWarehouses).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    Promise.all([marketplaceService.listHeldOrders(), marketplaceService.listNeedsAction()])
      .then(([nextHeld, nextNeedsAction]) => {
        if (!active) return;
        setHeld(nextHeld);
        setNeedsAction(nextNeedsAction);
      })
      .catch(() => {
        if (!active) return;
        setHeld([]);
        setNeedsAction([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [nonce]);

  return { held, needsAction, loading, refetch };
}
