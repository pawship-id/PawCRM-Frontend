"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { openingBalanceService } from "@/services/openingBalance.service";
import type { CashBankOpening } from "@/types/accounting";

export interface UseCashBankOpeningResult {
  opening: CashBankOpening | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * The saved opening balance of Kas & Bank, with the accounts to fill in.
 *
 * `enabled` is the caller's `openingBalances:read` — a role without it must not
 * collect a 403 for a figure the Data awal row would simply leave out.
 */
export function useCashBankOpening(enabled = true): UseCashBankOpeningResult {
  const [opening, setOpening] = useState<CashBankOpening | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    // The sanctioned fetch-effect shape this repo uses everywhere — the stale
    // response guard below is what makes the late setStates safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    openingBalanceService
      .getCashBank()
      .then((result) => {
        if (active) setOpening(result);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Saldo awal kas & bank tidak bisa dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [enabled, nonce]);

  return { opening, loading, error, refetch };
}
