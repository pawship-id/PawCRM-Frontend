"use client";

import { useEffect, useState } from "react";

import { membershipService } from "@/services/membership.service";
import type { PetMembership } from "@/types/membership";

/**
 * The cards a basket's customer holds right now — active or paused — for the
 * perk chips under the customer's name and the plan on each animal's header.
 *
 * Keyed by the customer, so the answer for the last customer is never shown
 * for this one. A failure is silent: the chips are a reminder, not a gate.
 */
export function useCustomerMemberships(customerId: string | null) {
  const [loaded, setLoaded] = useState<{ key: string; cards: PetMembership[] }>({
    key: "",
    cards: [],
  });

  useEffect(() => {
    if (!customerId) return;

    let live = true;

    membershipService
      .listMemberships({
        customerId,
        status: ["active", "paused"],
        sort: "endingSoonest",
        limit: 50,
      })
      .then((result) => {
        if (live) setLoaded({ key: customerId, cards: result?.items ?? [] });
      })
      .catch(() => {
        if (live) setLoaded({ key: customerId, cards: [] });
      });

    return () => {
      live = false;
    };
  }, [customerId]);

  return customerId && loaded.key === customerId ? loaded.cards : [];
}
