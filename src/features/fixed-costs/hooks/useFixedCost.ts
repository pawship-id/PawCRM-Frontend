"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { fixedCostService } from "@/services/fixedCost.service";
import type { FixedCost } from "@/types/accounting";

/**
 * ONE fixed cost, from GET /fixed-costs/:id.
 *
 * SEPARATE FROM `useFixedCosts`, which pages a list: the detail page needs one
 * document and the actions on it — Jeda, Hapus, Catat — all write and re-read,
 * so `reload` is the point of the hook rather than an afterthought.
 */
export function useFixedCost(id: string) {
  const [fixedCost, setFixedCost] = useState<FixedCost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;

    // The sanctioned fetch-effect shape: flag the load, then synchronize with
    // the server, `active` guarding the late setStates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    fixedCostService
      .getById(id)
      .then((result) => {
        if (active) setFixedCost(result);
      })
      .catch((err) => {
        if (!active) return;
        setFixedCost(null);
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat biaya tetap. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, nonce]);

  return { fixedCost, loading, error, reload };
}
