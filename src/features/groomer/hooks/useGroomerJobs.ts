"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/services/api-error";
import { groomerService } from "@/services/groomer.service";
import type { GroomerJobs } from "@/types/groomer";

/** One day of the groomer's work. The actions are `useGroomerActions`. */
export function useGroomerJobs(date: string) {
  const [data, setData] = useState<GroomerJobs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const mine = ++requestId.current;

    try {
      const result = await groomerService.jobs(date);
      // A newer request (another day tapped) wins; drop this late answer.
      if (mine !== requestId.current) return;
      setData(result);
      setError(null);
    } catch (caught) {
      if (mine !== requestId.current) return;
      setError(caught instanceof ApiError ? caught.message : "Gagal memuat job. Coba lagi.");
    } finally {
      if (mine === requestId.current) setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    // The sanctioned fetch-effect shape — see useCustomers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
