"use client";

import { useEffect, useState } from "react";

import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import { ApiError } from "@/services/api-error";
import type { PurchaseActivityEntry } from "@/types/api";

interface UsePurchaseActivityResult {
  items: PurchaseActivityEntry[];
  loading: boolean;
  error: string | null;
}

/**
 * The history of one purchase — a goods receipt and its invoice, merged by the
 * server. Either document's id reaches the same timeline. `version` re-reads it
 * after a write on the screen (receive, close, payment).
 */
export function usePurchaseActivity(
  kind: "receipt" | "invoice",
  id: string,
  version = 0,
): UsePurchaseActivityResult {
  const [items, setItems] = useState<PurchaseActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const request =
      kind === "receipt"
        ? goodsReceiptService.activity(id)
        : purchaseInvoiceService.activity(id);

    request
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
  }, [kind, id, version]);

  return { items, loading, error };
}
