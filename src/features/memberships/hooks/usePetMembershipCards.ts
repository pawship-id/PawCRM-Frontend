"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { membershipService } from "@/services/membership.service";
import type { PetMembership } from "@/types/membership";

/**
 * Every card ONE animal holds, with live benefit counters — the pet profile's
 * Membership panel.
 *
 * ACTIVE AND LAPSED ALIKE. The panel shows what can be spent today AND what has
 * run out, because the second is what a renewal is offered from; filtering here
 * would make the profile fetch twice to draw one card.
 */
export function usePetMembershipCards(petId: string | null) {
  const [cards, setCards] = useState<PetMembership[]>([]);
  const [loading, setLoading] = useState(Boolean(petId));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;

    /*
      THE NO-PET CASE IS HANDLED INSIDE THE SAME EFFECT, not before it, because
      an early `return` with a `setState` above it is a synchronous state write
      in an effect body — a cascading render the lint rule is right to refuse.
      Nothing is fetched and the two states are set through the same guarded
      path every other branch uses.
    */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(Boolean(petId));
    setError(null);

    if (!petId) {
      setCards([]);
      return () => {
        active = false;
      };
    }

    membershipService
      .listForPet(petId)
      .then((result) => {
        if (active) setCards(result.items);
      })
      .catch((err) => {
        if (!active) return;
        setCards([]);
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat membership hewan ini.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [petId, nonce]);

  return { cards, loading, error, reload };
}
