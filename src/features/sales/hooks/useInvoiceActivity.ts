"use client";

import { useEffect, useState } from "react";

import { customerInvoiceService } from "@/services/customerInvoice.service";
import { ApiError } from "@/services/api-error";
import type { InvoiceActivityEntry } from "@/types/api";

interface UseInvoiceActivityResult {
  items: InvoiceActivityEntry[];
  loading: boolean;
  error: string | null;
}

/**
 * One invoice's activity log.
 *
 * `enabled` LETS A CALLER HOLD THE READ BACK. The detail screen does not: its
 * folded panel shows the entry COUNT, which cannot be known without the entries.
 *
 * `version` REFETCHES IT. The detail screen bumps it after every write that
 * leaves a trail (an edit, a payment, a cancellation), so an open log shows the
 * row for what was just done instead of the history from before it.
 */
export function useInvoiceActivity(
  invoiceId: string,
  { enabled, version }: { enabled: boolean; version: number },
): UseInvoiceActivityResult {
  const [items, setItems] = useState<InvoiceActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    customerInvoiceService
      .activity(invoiceId)
      .then((result) => {
        if (active) setItems(result.items ?? []);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Riwayat aktivitas gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [invoiceId, enabled, version]);

  return { items, loading, error };
}
