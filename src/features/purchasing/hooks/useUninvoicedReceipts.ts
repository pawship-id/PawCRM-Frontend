"use client";

import { useEffect, useState } from "react";

import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { ApiError } from "@/services/api-error";
import type { GoodsReceiptListRow } from "@/types/api";

/**
 * One page is enough for a picker. A tenant has a handful of deliveries awaiting
 * paperwork at any moment, not thousands — if this ever truncates, the honest
 * answer is a searchable picker, not a bigger number.
 */
const OPTION_LIMIT = 100;

interface UseUninvoicedReceiptsResult {
  receipts: GoodsReceiptListRow[];
  loading: boolean;
  error: string | null;
  /** True when the server had more than `OPTION_LIMIT` to offer. */
  truncated: boolean;
  /**
   * The supplier the current `receipts` were answered for — "" until the first
   * answer. The form compares it with the supplier on screen before acting on
   * the list, so an answer for the PREVIOUS pick can never open the picker.
   */
  loadedFor: string;
}

/**
 * One supplier's deliveries still waiting for its bill — what the Catat faktur
 * form offers to bill once the supplier is picked (16 October 2026, BO). No
 * supplier, no request: an empty `supplierId` answers an empty list.
 *
 * BOTH FILTERS ARE ASKED OF THE SERVER, and that is the whole point of this
 * hook existing rather than a `.filter()` at the call site:
 *
 *   invoiced: false      — `invoiceId` is stamped onto a receipt when a bill is
 *                          filed against it, so its absence IS the answer.
 *   purchaseType:        — a `konsinyasi` delivery can never be invoiced on
 *     "beli_putus"         arrival: the goods stay the supplier's until they
 *                          sell, so nothing is owed yet and the API refuses it
 *                          with a 400. Offering one would be offering a choice
 *                          that always fails.
 *
 * Filtering a PAGE client-side would be wrong, not merely slower: the server
 * pages before the client can filter, so "page 2 of unbilled deliveries" comes
 * back empty while unbilled deliveries sit on page 3. `?invoiced=` exists so the
 * rows and the count are decided in the same place.
 *
 * `truncated` is surfaced rather than swallowed. A picker that silently drops
 * options reads as "there are no more", which is the one thing it must not say
 * when there are.
 */
export function useUninvoicedReceipts(
  supplierId: string,
): UseUninvoicedReceiptsResult {
  const [receipts, setReceipts] = useState<GoodsReceiptListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loadedFor, setLoadedFor] = useState("");

  useEffect(() => {
    if (!supplierId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReceipts([]);
      setTruncated(false);
      setLoadedFor("");
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);

    goodsReceiptService
      .list({
        supplierId,
        limit: OPTION_LIMIT,
        invoiced: false,
        // ANY status since 14 October 2026: a bill may document an order still
        // on its way — the payable only grows as the goods are received.
        purchaseType: "beli_putus",
      })
      .then((result) => {
        if (!active) return;
        setReceipts(result.items);
        setTruncated(result.pagination.total > result.items.length);
        setLoadedFor(supplierId);
      })
      .catch((err) => {
        if (!active) return;
        setReceipts([]);
        setLoadedFor(supplierId);
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat daftar penerimaan. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [supplierId]);

  return { receipts, loading, error, truncated, loadedFor };
}
