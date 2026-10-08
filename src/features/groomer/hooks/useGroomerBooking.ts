"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/services/api-error";
import { groomerService } from "@/services/groomer.service";
import type { GroomerBookingDetail } from "@/types/groomer";

/** One booking with its sessions in full — the detail screen's read. */
export function useGroomerBooking(id: string) {
  const [data, setData] = useState<GroomerBookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const mine = ++requestId.current;

    try {
      const result = await groomerService.booking(id);
      if (mine !== requestId.current) return;
      setData(result);
      setError(null);
    } catch (caught) {
      if (mine !== requestId.current) return;
      setError(
        caught instanceof ApiError
          ? { message: caught.message, status: caught.status }
          : { message: "Gagal memuat booking. Coba lagi." },
      );
    } finally {
      if (mine === requestId.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
