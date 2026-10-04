"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { customerTypeService } from "@/services/customerType.service";
import type { CustomerType } from "@/services/customerType.service";

export interface UseCustomerTypeListResult {
  /** Every customer type of the tenant. There are no deleted ones to filter. */
  types: CustomerType[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * The Tipe pelanggan screen's list — one load at the service's own limit
 * (100), matching `useZoneList`'s bargain: a tenant runs a handful of these,
 * so there is no pagination to build.
 */
export function useCustomerTypeList(): UseCustomerTypeListResult {
  const [types, setTypes] = useState<CustomerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // The sanctioned fetch-effect shape this repo uses everywhere.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    customerTypeService
      .list()
      .then((result) => {
        if (!active) return;
        setTypes(result.items);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat tipe pelanggan. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [nonce]);

  return { types, loading, error, refetch };
}
