"use client";

import { useEffect, useState } from "react";

import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import type {
  PurchaseInvoiceListRow,
  SupplierOutstandingSummary,
} from "@/types/api";

/** Rows each panel shows before the footer takes over. */
export const PREVIEW_ROWS = 5;

export interface PayablePanelData {
  /** The rows to display — the server was asked for exactly PREVIEW_ROWS. */
  rows: PurchaseInvoiceListRow[];
  /** How many invoices are in this bucket ACROSS THE WHOLE BOOK, not just rows. */
  count: number;
  /**
   * Σ outstanding across the bucket, or null when the summary did not arrive.
   *
   * Null is a real answer and callers must render it as an absence rather than
   * as zero: a panel showing "Rp 0" over eleven unpaid bills is worse than one
   * showing nothing, because it is a number somebody will act on. It no longer
   * means "could not be computed exactly" — the server computes both totals over
   * the whole book — only "that one request failed".
   */
  total: string | null;
}

interface UsePayablesPanelsResult {
  overdue: PayablePanelData;
  dueSoon: PayablePanelData;
  /** Invoices not yet settled, across the whole book — the section card's count. */
  outstandingCount: number | null;
  /** The due-soon window the server used, for the panel's caption. Null until loaded. */
  horizonDays: number | null;
  loading: boolean;
}

const EMPTY_PANEL: PayablePanelData = { rows: [], count: 0, total: null };

/**
 * The two lists the purchasing hub opens with: what is already late, and what
 * falls due this week.
 *
 * NOTHING HERE FILTERS OR ADDS ANYTHING UP. Every count and every rupiah figure
 * is the summary endpoint's, aggregated over the whole book in the database; the
 * five rows beside each are a separate, deliberately small read — a preview of a
 * total that was computed elsewhere.
 *
 * IT USED TO DO BOTH, and the two reasons are worth recording because they are
 * what the API changed to remove:
 *
 *   - `dueBefore` bounds only the far end of the window, so "due within seven
 *     days" always came back with everything already overdue mixed in, and this
 *     hook dropped those rows itself. Two panels read side by side, one of them
 *     silently containing the other, is money counted twice. `?dueSoon=true` is
 *     the server-side complement of `?overdue=true`, cut at one instant.
 *   - The due-soon rupiah total was summed HERE, over a fetch of fifty rows, and
 *     abandoned as null whenever the bucket might have been larger than the
 *     fetch. `totalDueSoonOutstanding` is summed in the same aggregation as the
 *     overdue one, so it is exact however many invoices there are — and the fetch
 *     is now five rows, the number actually displayed.
 *
 * THE HORIZON IS THE SERVER'S TOO, echoed back as `horizonDays` and rendered in
 * the caption. A constant here would keep captioning "7 hari" the day that
 * default changes.
 */
export function usePayablesPanels(
  /** Skip every request when the role cannot read payables. */
  enabled: boolean,
): UsePayablesPanelsResult {
  const [overdue, setOverdue] = useState<PayablePanelData>(EMPTY_PANEL);
  const [dueSoon, setDueSoon] = useState<PayablePanelData>(EMPTY_PANEL);
  const [outstandingCount, setOutstandingCount] = useState<number | null>(null);
  const [horizonDays, setHorizonDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;

    let active = true;

    // Settled independently: each panel is readable without the other, and the
    // hub must not go blank because one of three requests failed.
    Promise.allSettled([
      purchaseInvoiceService.outstandingSummary(),
      purchaseInvoiceService.list({ overdue: true, limit: PREVIEW_ROWS }),
      purchaseInvoiceService.list({ dueSoon: true, limit: PREVIEW_ROWS }),
    ]).then(([summaryResult, overdueResult, dueSoonResult]) => {
      if (!active) return;

      const summary =
        summaryResult.status === "fulfilled"
          ? (summaryResult.value as SupplierOutstandingSummary)
          : null;

      if (summary) {
        setOutstandingCount(summary.totalInvoices);
        setHorizonDays(summary.horizonDays);
      }

      if (overdueResult.status === "fulfilled") {
        setOverdue({
          rows: overdueResult.value.items,
          // The server's whole-book count, not `items.length` — a panel reading
          // "3" beside three of eleven rows says the job is nearly done. The
          // pagination total is the same question asked of the same filter, so
          // it stands in when the summary is the request that failed.
          count:
            summary?.totalOverdueInvoices ??
            overdueResult.value.pagination.total,
          total: summary?.totalOverdueOutstanding ?? null,
        });
      }

      if (dueSoonResult.status === "fulfilled") {
        setDueSoon({
          rows: dueSoonResult.value.items,
          count:
            summary?.totalDueSoonInvoices ??
            dueSoonResult.value.pagination.total,
          total: summary?.totalDueSoonOutstanding ?? null,
        });
      }

      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [enabled]);

  return { overdue, dueSoon, outstandingCount, horizonDays, loading };
}
