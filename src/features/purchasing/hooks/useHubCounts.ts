"use client";

import { useEffect, useState } from "react";

import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { purchaseReturnService } from "@/services/purchaseReturn.service";
import { supplierService } from "@/services/supplier.service";
import type { PageResult } from "@/types/api";

/**
 * One row per request, because the ROW IS NOT THE ANSWER — `pagination.total` is.
 * Asking for a page and calling `.length` on it would silently cap at the page
 * size and report "20 penerimaan" forever, however many the tenant has.
 */
const COUNT_LIMIT = 1;

export interface HubCounts {
  /** Suppliers still being bought from — deactivated ones are excluded. */
  activeSuppliers: number | null;
  receipts: number | null;
  returns: number | null;
}

/** Whether the signed-in role may read each list. Denied → no request, null count. */
export interface HubCountGates {
  suppliers: boolean;
  receipts: boolean;
  returns: boolean;
}

const EMPTY: HubCounts = {
  activeSuppliers: null,
  receipts: null,
  returns: null,
};

/**
 * How many documents sit behind a section card, or null when there is no answer.
 *
 * Null is a real state and callers must render it as an absence rather than as
 * zero: it means the count has not arrived — the request is still in flight, it
 * failed, or the role was never allowed to ask. "0 penerimaan" over a book full
 * of deliveries is a number somebody would act on.
 *
 * A FAILED COUNT IS SWALLOWED, deliberately. A hub card is a signpost; a missing
 * figure is not worth an error banner over three other cards that loaded fine,
 * and the link underneath still works.
 */
function countOf<T>(
  enabled: boolean,
  request: () => Promise<PageResult<T>>,
): Promise<number | null> {
  if (!enabled) return Promise.resolve(null);

  return request()
    .then((result) => result.pagination.total)
    .catch(() => null);
}

/**
 * The row counts on the purchasing hub's section cards.
 *
 * COUNTS, NEVER MONEY. A count of documents makes the "is there anything here"
 * point without claiming to be an account — the rupiah figures on this screen all
 * come from server-side aggregation (see usePayablesPanels), and none of them
 * come from here.
 *
 * THE PAYABLES CARD IS NOT ONE OF THESE. Its count is the outstanding summary's,
 * which already sums over the whole book for the two panels below, so counting
 * unsettled invoices again here would be a second request for a figure the screen
 * already holds.
 *
 * EACH COUNT IS GATED ON ITS OWN GRANT, matching the cards' own gates and the
 * sidebar. A role with no Retur ke Supplier link issues no request for one — a
 * 403 in the console is a worse answer than not asking.
 */
export function useHubCounts({
  suppliers,
  receipts,
  returns,
}: HubCountGates): HubCounts {
  const [counts, setCounts] = useState<HubCounts>(EMPTY);

  useEffect(() => {
    let active = true;

    // Independent: each card is readable without the others, and one endpoint
    // being down must cost its own figure rather than the other two.
    Promise.all([
      countOf(suppliers, () =>
        supplierService.list({ isActive: true, limit: COUNT_LIMIT }),
      ),
      countOf(receipts, () => goodsReceiptService.list({ limit: COUNT_LIMIT })),
      countOf(returns, () => purchaseReturnService.list({ limit: COUNT_LIMIT })),
    ]).then(([activeSuppliers, receiptCount, returnCount]) => {
      if (!active) return;
      setCounts({
        activeSuppliers,
        receipts: receiptCount,
        returns: returnCount,
      });
    });

    return () => {
      active = false;
    };
  }, [suppliers, receipts, returns]);

  return counts;
}
