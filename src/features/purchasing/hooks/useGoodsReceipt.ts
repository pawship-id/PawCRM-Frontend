"use client";

import { useCallback, useEffect, useState } from "react";

import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { ApiError } from "@/services/api-error";
import type { GoodsReceiptDetail } from "@/types/api";

interface UseGoodsReceiptResult {
  receipt: GoodsReceiptDetail | null;
  loading: boolean;
  error: string | null;
  /** True when the id does not resolve — a 404, not a transport failure. */
  notFound: boolean;
  refetch: () => void;
}

/**
 * One goods receipt, for the detail screen.
 *
 * NOT-FOUND IS ITS OWN STATE rather than just another error string, exactly as in
 * useSupplier. "This delivery does not exist" and "the request failed" call for
 * different screens — one offers a way back to the list, the other offers a
 * retry — and collapsing them would leave a user retrying a URL that will never
 * resolve. Another tenant's receipt 404s here like an unknown id, which is the
 * backend's intended answer: a 403 would confirm the id exists.
 *
 * `refetch` EXISTS FOR THE TRANSPORT, not for the document. Nothing on this
 * screen can change the receipt — it has no edit and no delete — so the only
 * reason to ask again is that the last ask failed.
 */
export function useGoodsReceipt(id: string): UseGoodsReceiptResult {
  const [receipt, setReceipt] = useState<GoodsReceiptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setNotFound(false);

    goodsReceiptService
      .getById(id)
      .then((result) => {
        if (!active) return;
        setReceipt(result);
      })
      .catch((err) => {
        if (!active) return;
        setReceipt(null);
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return;
        }
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat detail penerimaan. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, nonce]);

  return { receipt, loading, error, notFound, refetch };
}
