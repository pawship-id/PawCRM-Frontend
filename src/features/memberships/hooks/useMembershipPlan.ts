"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { membershipService } from "@/services/membership.service";
import type { MembershipPlan } from "@/types/membership";

/** ONE package, from GET /membership-plans/:id — the detail and edit screens. */
export function useMembershipPlan(id: string) {
  const [plan, setPlan] = useState<MembershipPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    membershipService
      .getPlan(id)
      .then((result) => {
        if (active) setPlan(result);
      })
      .catch((err) => {
        if (!active) return;
        setPlan(null);
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat paket membership. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, nonce]);

  return { plan, loading, error, reload };
}
