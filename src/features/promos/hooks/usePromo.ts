"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { promoService } from "@/services/promo.service";
import type { Promo } from "@/types/promo";

/** ONE promo, from GET /promos/:id — the edit screen. */
export function usePromo(id: string) {
  const [promo, setPromo] = useState<Promo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    promoService
      .get(id)
      .then((result) => {
        if (active) setPromo(result);
      })
      .catch((err) => {
        if (!active) return;
        setPromo(null);
        setError(err instanceof ApiError ? err.fullMessage : "Gagal memuat promo. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  return { promo, loading, error };
}
