"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { membershipService } from "@/services/membership.service";
import type { PetMembership } from "@/types/membership";

/**
 * One card with its live counters, ledger (`redemptions`) and change log
 * (`history`) — the Anggota detail. `reload` after any act on it.
 */
export function useMembershipCard(id: string) {
  const [card, setCard] = useState<PetMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);

    membershipService
      .getMembership(id)
      .then((result) => {
        if (active) setCard(result);
      })
      .catch((err) => {
        if (!active) return;
        setCard(null);
        setError(err instanceof ApiError ? err.message : "Gagal memuat membership.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, nonce]);

  return { card, loading, error, reload };
}
