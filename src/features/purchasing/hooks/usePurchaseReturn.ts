"use client";

import { useCallback, useEffect, useState } from "react";

import { purchaseReturnService } from "@/services/purchaseReturn.service";
import { ApiError } from "@/services/api-error";
import type { PurchaseReturnDetail } from "@/types/api";

interface UsePurchaseReturnResult {
  purchaseReturn: PurchaseReturnDetail | null;
  loading: boolean;
  error: string | null;
  /** True when the id does not resolve — a 404, not a transport failure. */
  notFound: boolean;
  refetch: () => void;
  /** Replaces the loaded document with one a write just returned. */
  replace: (next: PurchaseReturnDetail) => void;
}

/**
 * One purchase return, for the detail screen.
 *
 * NOT-FOUND IS ITS OWN STATE rather than just another error string, exactly as in
 * useGoodsReceipt. "This return does not exist" and "the request failed" call for
 * different screens — one offers a way back to the list, the other a retry — and
 * collapsing them would leave a user retrying a URL that will never resolve.
 * Another tenant's return 404s here like an unknown id, which is the backend's
 * intended answer: a 403 would confirm the id exists.
 *
 * `replace` EXISTS AND `refetch` IS NOT ENOUGH. Every write on this endpoint —
 * update, submit — answers with the whole document in its post-write state, so
 * re-reading it afterwards would be a second round trip to learn something the
 * first response already said, with a window in between where the screen shows
 * the old status. It matters most for the submit: the difference between "this is
 * now final" appearing instantly and appearing after a flicker is the difference
 * between a user believing it worked and pressing the button again.
 */
export function usePurchaseReturn(id: string): UsePurchaseReturnResult {
  const [purchaseReturn, setPurchaseReturn] =
    useState<PurchaseReturnDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const replace = useCallback((next: PurchaseReturnDetail) => {
    setPurchaseReturn(next);
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setNotFound(false);

    purchaseReturnService
      .getById(id)
      .then((result) => {
        if (!active) return;
        setPurchaseReturn(result);
      })
      .catch((err) => {
        if (!active) return;
        setPurchaseReturn(null);
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return;
        }
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat detail retur. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, nonce]);

  return { purchaseReturn, loading, error, notFound, refetch, replace };
}
