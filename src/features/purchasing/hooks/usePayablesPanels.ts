"use client";

import { useEffect, useState } from "react";

import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import { sumDecimals } from "@/utils/decimal";
import type {
  PurchaseInvoiceListRow,
  SupplierOutstandingSummary,
} from "@/types/api";

/** How far ahead the second panel looks. A week is one payment run. */
export const HORIZON_DAYS = 7;

/**
 * How many rows to pull for the due-soon panel.
 *
 * Larger than the five it displays, on purpose: within a seven-day window a
 * tenant has a handful of bills falling due, so this fetch is almost always the
 * COMPLETE set — which is what lets its rupiah total be summed exactly. Past
 * this bound the panel stops claiming a total rather than showing a partial one.
 * See `dueSoon.total` below.
 */
const DUE_SOON_FETCH = 50;

/** Rows each panel shows before the footer takes over. */
export const PREVIEW_ROWS = 5;

export interface PayablePanelData {
  /** The rows to display — already trimmed to PREVIEW_ROWS. */
  rows: PurchaseInvoiceListRow[];
  /** How many invoices are in this bucket ACROSS THE WHOLE BOOK, not just rows. */
  count: number;
  /**
   * Σ outstanding across the bucket, or null when it cannot be stated exactly.
   *
   * Null is a real answer and callers must render it as an absence rather than
   * as zero: a panel showing "Rp 0" over eleven unpaid bills is worse than one
   * showing nothing, because it is a number somebody will act on.
   */
  total: string | null;
}

interface UsePayablesPanelsResult {
  overdue: PayablePanelData;
  dueSoon: PayablePanelData;
  /** Invoices not yet settled, across the whole book — the section card's count. */
  outstandingCount: number | null;
  loading: boolean;
}

const EMPTY_PANEL: PayablePanelData = { rows: [], count: 0, total: null };

/** The instant `HORIZON_DAYS` from now, as the API's `dueBefore` wants it. */
function horizonIso(): string {
  return new Date(Date.now() + HORIZON_DAYS * 86_400_000).toISOString();
}

/**
 * The two lists the purchasing hub opens with: what is already late, and what
 * falls due this week.
 *
 * THE OVERDUE FIGURES ARE THE SUMMARY ENDPOINT'S, not this hook's arithmetic.
 * `/purchase-invoices/outstanding` sums over the whole book in the database, so
 * the count and the rupiah figure are exact however many invoices there are. The
 * five rows beside them are a separate, deliberately small read — a preview of a
 * total that was computed elsewhere.
 *
 * DUE-SOON EXCLUDES WHAT IS ALREADY LATE, which is the one thing the API cannot
 * express: `dueBefore` bounds the far end of the window and there is no bound for
 * the near end, so "unsettled and due before the horizon" necessarily includes
 * everything overdue. The two panels are read side by side, and an invoice
 * appearing in both would be counted twice by somebody adding up what they owe —
 * so the overdue ones are removed here.
 *
 * WHICH IS WHY THE DUE-SOON TOTAL IS CONDITIONAL. Once that filtering happens
 * client-side, an exact total is only possible when the fetch returned the
 * complete bucket. It nearly always does — a seven-day window holds a handful of
 * bills against a fetch of fifty — and when it does not, `total` is null and the
 * panel says how many rather than how much. A figure summed from part of a set is
 * the failure mode this codebase avoids everywhere else; it is not worth
 * introducing here for a panel.
 */
export function usePayablesPanels(
  /** Skip every request when the role cannot read payables. */
  enabled: boolean,
): UsePayablesPanelsResult {
  const [overdue, setOverdue] = useState<PayablePanelData>(EMPTY_PANEL);
  const [dueSoon, setDueSoon] = useState<PayablePanelData>(EMPTY_PANEL);
  const [outstandingCount, setOutstandingCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    const dueBefore = horizonIso();

    // Settled independently: each panel is readable without the other, and the
    // hub must not go blank because one of three requests failed.
    Promise.allSettled([
      purchaseInvoiceService.outstandingSummary(),
      purchaseInvoiceService.list({ overdue: true, limit: PREVIEW_ROWS }),
      purchaseInvoiceService.list({
        outstanding: true,
        dueBefore,
        limit: DUE_SOON_FETCH,
      }),
    ]).then(([summaryResult, overdueResult, dueSoonResult]) => {
      if (!active) return;

      const summary =
        summaryResult.status === "fulfilled"
          ? (summaryResult.value as SupplierOutstandingSummary)
          : null;

      if (summary) setOutstandingCount(summary.totalInvoices);

      if (overdueResult.status === "fulfilled") {
        setOverdue({
          rows: overdueResult.value.items,
          // The server's whole-book count, not `items.length` — a panel reading
          // "3" beside three of eleven rows says the job is nearly done.
          count: summary?.totalOverdueInvoices ?? overdueResult.value.pagination.total,
          total: summary?.totalOverdueOutstanding ?? null,
        });
      }

      if (dueSoonResult.status === "fulfilled") {
        const { items, pagination } = dueSoonResult.value;
        const complete = pagination.total <= items.length;
        const upcoming = items.filter((invoice) => !invoice.isOverdue);

        setDueSoon({
          rows: upcoming.slice(0, PREVIEW_ROWS),
          // Exact when the fetch was complete. Otherwise the best available
          // lower bound — the API cannot count "due soon but not yet late".
          count: complete
            ? upcoming.length
            : pagination.total - (summary?.totalOverdueInvoices ?? 0),
          total: complete
            ? sumDecimals(upcoming.map((invoice) => invoice.outstandingAmount))
            : null,
        });
      }

      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [enabled]);

  return { overdue, dueSoon, outstandingCount, loading };
}
