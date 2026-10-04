"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { cashTransactionService } from "@/services/cashTransaction.service";
import type { CashTransaction } from "@/types/api";

export interface UseCashTransactionResult {
  transaction: CashTransaction | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  /**
   * Replace the held transaction with the one a write returned. An edit or a
   * cancellation answers with the new state, so there is nothing to refetch.
   */
  apply: (next: CashTransaction) => void;
  refetch: () => void;
}

/** One transaction, from GET /cash-transactions/:id. Same shape as useCustomerInvoice. */
export function useCashTransaction(id: string): UseCashTransactionResult {
  const [transaction, setTransaction] = useState<CashTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  const apply = useCallback((next: CashTransaction) => setTransaction(next), []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setNotFound(false);

    cashTransactionService
      .getById(id)
      .then((result) => {
        if (active) setTransaction(result);
      })
      .catch((err) => {
        if (!active) return;
        setTransaction(null);
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return;
        }
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat transaksi. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, nonce]);

  return { transaction, loading, error, notFound, apply, refetch };
}
