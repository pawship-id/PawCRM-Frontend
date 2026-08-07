"use client";

import { useCallback, useEffect, useState } from "react";

import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { productBatchService } from "@/services/productBatch.service";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import type {
  SupplierConsignmentRow,
  SupplierOutstandingRow,
  SupplierPurchaseRow,
} from "@/types/api";

/**
 * What each supplier owes, has delivered, and still has consigned — as lookups
 * keyed by supplier id.
 *
 * THREE REQUESTS FOR THE WHOLE SCREEN, not three per row. Each endpoint answers
 * for every supplier at once, so a twenty-row page costs the same as a one-row
 * page. Asking per row would be sixty round trips and would still be wrong: the
 * totals are summed over the whole book server-side, which is not something a
 * client holding one page could reproduce.
 *
 * A SUPPLIER MISSING FROM A MAP MEANS ZERO, and that is the API's shape rather
 * than an accident — a vendor with no debt has no row to return. Callers read a
 * miss as zero instead of treating it as missing data.
 *
 * FAILURE IS PER-SUMMARY AND NEVER FATAL. These are extra columns on a list that
 * is perfectly readable without them: if the payables endpoint is down, or the
 * signed-in role lacks `purchaseInvoices:read`, the supplier list must still
 * render with its own data. So each promise is settled independently and a
 * rejection leaves that one map empty rather than blanking the screen.
 */
export interface SupplierSummaries {
  outstanding: Map<string, SupplierOutstandingRow>;
  purchases: Map<string, SupplierPurchaseRow>;
  consignment: Map<string, SupplierConsignmentRow>;
  /** Grand totals across every supplier, for the header figures. */
  totals: {
    outstanding: string;
    purchased: string;
    consignmentValue: string;
  };
  loading: boolean;
  refetch: () => void;
}

const ZERO = "0.0000";

/** Rows keyed by supplier id. Ids arrive as strings from the JSON envelope. */
function index<T extends { supplierId: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [String(row.supplierId), row]));
}

export function useSupplierSummaries(
  options: { supplierId?: string } = {},
): SupplierSummaries {
  const { supplierId } = options;

  const [outstanding, setOutstanding] = useState<
    Map<string, SupplierOutstandingRow>
  >(new Map());
  const [purchases, setPurchases] = useState<Map<string, SupplierPurchaseRow>>(
    new Map(),
  );
  const [consignment, setConsignment] = useState<
    Map<string, SupplierConsignmentRow>
  >(new Map());
  const [totals, setTotals] = useState({
    outstanding: ZERO,
    purchased: ZERO,
    consignmentValue: ZERO,
  });
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    const query = supplierId ? { supplierId } : {};

    // allSettled, not all: one endpoint failing must cost its own column, not
    // the other two and not the screen. See the header.
    Promise.allSettled([
      purchaseInvoiceService.outstandingSummary(query),
      goodsReceiptService.summary(query),
      productBatchService.consignmentSummary(query),
    ])
      .then(([owed, bought, consigned]) => {
        if (!active) return;

        setOutstanding(
          owed.status === "fulfilled" ? index(owed.value.items) : new Map(),
        );
        setPurchases(
          bought.status === "fulfilled" ? index(bought.value.items) : new Map(),
        );
        setConsignment(
          consigned.status === "fulfilled"
            ? index(consigned.value.items)
            : new Map(),
        );

        setTotals({
          outstanding:
            owed.status === "fulfilled" ? owed.value.totalOutstanding : ZERO,
          purchased:
            bought.status === "fulfilled" ? bought.value.totalPurchased : ZERO,
          consignmentValue:
            consigned.status === "fulfilled" ? consigned.value.totalValue : ZERO,
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [supplierId, nonce]);

  return { outstanding, purchases, consignment, totals, loading, refetch };
}
