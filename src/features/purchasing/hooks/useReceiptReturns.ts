"use client";

import { useEffect, useState } from "react";

import { purchaseReturnService } from "@/services/purchaseReturn.service";
import type { PurchaseReturnListRow } from "@/types/api";

/** A delivery is reversed by a handful of returns, not by a page of them. */
const LIMIT = 50;

/**
 * The returns raised against one delivery.
 *
 * WHY A RECEIPT SCREEN READS RETURNS. A posted receipt has no edit and no delete,
 * so the only thing that can change what it means afterwards is a return. A
 * detail screen silent about that invites somebody to send the same goods back
 * twice — and a second return of goods already gone is a stock write-off nobody
 * asked for.
 *
 * BEST-EFFORT, like useReceiptLots and for the same reason: `purchaseReturns:read`
 * is a permission separate from `goodsReceipts:read`. A failure resolves to an
 * empty list, never to an error on the screen. The cost of being wrong is a
 * missing notice, not a page that will not render — and the notice is a warning,
 * not the authority: the API refuses an over-return regardless of what this
 * showed.
 *
 * BOTH STATUSES ARE FETCHED. A `draft` return has moved nothing yet, but somebody
 * is clearly already working on one, and "there is a draft against this delivery"
 * is exactly what stops a second person starting another.
 */
export function useReceiptReturns(
  receiptId: string,
): PurchaseReturnListRow[] {
  const [returns, setReturns] = useState<PurchaseReturnListRow[]>([]);

  useEffect(() => {
    if (!receiptId) return;

    let active = true;

    purchaseReturnService
      .list({ originalReceiptId: receiptId, limit: LIMIT })
      .then((result) => {
        if (!active) return;
        setReturns(result.items);
      })
      // See the header: a refusal here costs the notice, not the page.
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [receiptId]);

  return returns;
}
