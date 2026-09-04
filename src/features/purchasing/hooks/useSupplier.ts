"use client";

import { useCallback, useEffect, useState } from "react";

import { supplierService } from "@/services/supplier.service";
import { ApiError } from "@/services/api-error";
import type { Supplier } from "@/types/api";

interface UseSupplierResult {
  supplier: Supplier | null;
  loading: boolean;
  error: string | null;
  /** True when the id does not resolve — a 404, not a transport failure. */
  notFound: boolean;
  refetch: () => void;
}

/**
 * One supplier, for the detail and edit screens.
 *
 * NOT-FOUND IS ITS OWN STATE rather than just another error string. "This
 * supplier does not exist" and "the request failed" call for different screens —
 * one offers a way back to the list, the other offers a retry — and collapsing
 * them into an error banner would leave a user retrying a URL that will never
 * resolve. The tenant scope is the backend's business: another tenant's supplier
 * 404s here exactly like an unknown id, which is the intended answer.
 */
export function useSupplier(id: string): UseSupplierResult {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setNotFound(false);

    supplierService
      .getById(id)
      .then((result) => {
        if (!active) return;
        setSupplier(result);
      })
      .catch((err) => {
        if (!active) return;
        setSupplier(null);
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return;
        }
        setError(
          err instanceof ApiError
            ? err.message
            : "Gagal memuat data supplier. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, nonce]);

  return { supplier, loading, error, notFound, refetch };
}
