"use client";

import { useCallback, useEffect, useState } from "react";

import { customerInvoiceService } from "@/services/customerInvoice.service";
import { ApiError } from "@/services/api-error";
import type { CustomerInvoiceDetail } from "@/types/api";

interface UseCustomerInvoiceResult {
  invoice: CustomerInvoiceDetail | null;
  loading: boolean;
  error: string | null;
  /** True when the id does not resolve — a 404, not a transport failure. */
  notFound: boolean;
  /**
   * Replace the held invoice with one the server just returned.
   *
   * `recordPayment` answers with the UPDATED invoice — new `paidAmount`, new
   * `status`, the payment appended — so handing it straight to this is both
   * faster and more correct than a refetch: it is the exact document the write
   * produced, rather than whatever a second read happens to see.
   */
  applyInvoice: (invoice: CustomerInvoiceDetail) => void;
  refetch: () => void;
}

/**
 * One receivable, for the detail screen.
 *
 * NOT-FOUND IS ITS OWN STATE rather than just another error string, exactly as
 * in usePurchaseInvoice. "This invoice does not exist" and "the request failed"
 * call for different screens — one offers a way back to the list, the other a
 * retry — and collapsing them would leave a user retrying a URL that will never
 * resolve. Another tenant's invoice 404s here like an unknown id, which is the
 * backend's intended answer: a 403 would confirm the id exists.
 */
export function useCustomerInvoice(id: string): UseCustomerInvoiceResult {
  const [invoice, setInvoice] = useState<CustomerInvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  const applyInvoice = useCallback(
    (next: CustomerInvoiceDetail) => setInvoice(next),
    [],
  );

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setNotFound(false);

    customerInvoiceService
      .getById(id)
      .then((result) => {
        if (!active) return;
        setInvoice(result);
      })
      .catch((err) => {
        if (!active) return;
        setInvoice(null);
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return;
        }
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat detail faktur. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, nonce]);

  return { invoice, loading, error, notFound, applyInvoice, refetch };
}
