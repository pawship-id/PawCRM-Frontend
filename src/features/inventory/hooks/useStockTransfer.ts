"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { stockTransferService } from "@/services/stockTransfer.service";
import type { StockTransferDetail } from "@/types/inventory";

interface UseStockTransferResult {
  transfer: StockTransferDetail | null;
  loading: boolean;
  /** The server's sentence, or null. */
  error: string | null;
  /** True when the id names nothing this user may read (a 404). */
  notFound: boolean;
  /**
   * Replaces what is held with a document an action just answered with.
   *
   * Every write on /stock-transfers returns the WHOLE document, so a screen
   * that has just received a transfer already has the new truth in hand —
   * refetching would be a second round trip for an answer it was just given.
   */
  setTransfer: (transfer: StockTransferDetail) => void;
  refetch: () => void;
}

/**
 * One transfer — the document, what was asked for, the lots that left and, once
 * received, the lots that arrived.
 *
 * It used to be assembled from the ledger by a correlation id, because a
 * transfer had no document: no number, no status, nothing to hang an edit off.
 * It has one now, and the server returns everything this screen and the surat
 * jalan need in one read, labels included.
 */
export function useStockTransfer(transferId: string): UseStockTransferResult {
  const [transfer, setTransfer] = useState<StockTransferDetail | null>(null);
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

    stockTransferService
      .getById(transferId)
      .then((result) => {
        if (active) setTransfer(result);
      })
      .catch((err) => {
        if (!active) return;
        setTransfer(null);

        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return;
        }

        setError(
          err instanceof ApiError ? err.message : "Transfer gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [transferId, nonce]);

  return { transfer, loading, error, notFound, setTransfer, refetch };
}
