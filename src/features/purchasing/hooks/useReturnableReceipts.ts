"use client";

import { useEffect, useState } from "react";

import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { ApiError } from "@/services/api-error";
import type { GoodsReceiptListRow } from "@/types/api";

/**
 * One page is enough for a picker. A tenant raises a return against a recent
 * delivery, not against one from two years ago — if this ever truncates, the
 * honest answer is a searchable picker, not a bigger number.
 */
const OPTION_LIMIT = 100;

interface UseReturnableReceiptsResult {
  receipts: GoodsReceiptListRow[];
  loading: boolean;
  error: string | null;
  /** True when the server had more than `OPTION_LIMIT` to offer. */
  truncated: boolean;
}

/**
 * The deliveries a return can be raised against — what the create-return form
 * picks from.
 *
 * NO `purchaseType` FILTER, and that is the one thing worth reading here. Its
 * sibling useUninvoicedReceipts narrows to `beli_putus`, because a consignment
 * delivery genuinely cannot be invoiced — nothing is owed until the goods sell,
 * and the API refuses it. A RETURN IS NOT LIKE THAT. Consignment goods can be
 * sent back: the stock leaves and the weighted average is reversed exactly as for
 * an outright purchase, and only the journal entry is skipped, because there was
 * never a debt to discharge.
 *
 * The prototype this replaced filtered to `beli_putus` and was therefore
 * STRICTER THAN THE API — a shop could not return a consignment carton through
 * the UI at all, though the backend would have accepted it. The form now offers
 * both and labels the difference instead of hiding it.
 *
 * `truncated` is surfaced rather than swallowed. A picker that silently drops
 * options reads as "there are no more", which is the one thing it must not say
 * when there are.
 */
export function useReturnableReceipts(): UseReturnableReceiptsResult {
  const [receipts, setReceipts] = useState<GoodsReceiptListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    goodsReceiptService
      .list({ limit: OPTION_LIMIT })
      .then((result) => {
        if (!active) return;
        setReceipts(result.items);
        setTruncated(result.pagination.total > result.items.length);
      })
      .catch((err) => {
        if (!active) return;
        setReceipts([]);
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
  }, []);

  return { receipts, loading, error, truncated };
}
