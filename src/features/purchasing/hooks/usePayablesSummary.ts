"use client";

import { useCallback, useEffect, useState } from "react";

import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import type { PayablesSummary, PurchaseInvoiceListRow } from "@/types/api";

/** Rows each worklist shows before its footer takes over. */
export const PREVIEW_ROWS = 5;

/**
 * The period chips.
 *
 *   all    — every payment the shop has ever made; nothing about dates is sent.
 *   today / week / month — cut BY THE SERVER, in the tenant's timezone.
 *   custom — two dates somebody typed. With neither typed it also means every
 *            date, an honest reading of a range nobody has bounded yet.
 */
export type PayablesPeriod = "all" | "today" | "week" | "month" | "custom";

/** What the Ringkasan tab is scoped to. */
export interface PayablesSummaryQuery {
  /** "" = every cabang. */
  branchId: string;
  period: PayablesPeriod;
  /** `yyyy-mm-dd`. Read only under `custom`; bounds the PAYMENTS, never the
      invoice dates. */
  dateFrom: string;
  dateTo: string;
}

/** One worklist: the rows it shows, and the whole bucket behind them. */
export interface PayablesWorklist {
  rows: PurchaseInvoiceListRow[];
  /** How many invoices are in this bucket across the whole book. */
  count: number;
  /** Σ outstanding across the bucket, or null when the summary did not arrive. */
  total: string | null;
}

export interface UsePayablesSummaryResult {
  query: PayablesSummaryQuery;
  setQuery: (patch: Partial<PayablesSummaryQuery>) => void;
  summary: PayablesSummary | null;
  summaryFailed: boolean;
  /** Deliveries still `pending`, for the chosen cabang; null until known. */
  pendingReceipts: number | null;
  overdue: PayablesWorklist;
  dueSoon: PayablesWorklist;
  loading: boolean;
}

const EMPTY: PayablesWorklist = { rows: [], count: 0, total: null };

/**
 * WHAT THE TAB OPENS ON — every cabang, this month.
 *
 * THE MONTH IS A NAME, not two dates this hook worked out. The server cuts it in
 * the TENANT's timezone; a browser computing "1 Sep–today" would bound it in
 * whatever zone the laptop is set to and drop the first morning's payments for
 * anybody whose clock is not the shop's.
 *
 * ONLY THE PAYMENT CARD USES IT. The balances beside it ignore the period
 * entirely (see `PayablesSummary`), so opening on a month narrows one figure of
 * three rather than re-scoping the page.
 */
export const DEFAULT_PAYABLES_QUERY: PayablesSummaryQuery = {
  branchId: "",
  period: "month",
  dateFrom: "",
  dateTo: "",
};

/**
 * The Pembelian › Ringkasan tab's data: what is owed, and what has to be paid
 * next.
 *
 * NOTHING HERE FILTERS OR ADDS ANYTHING UP. Every count and every rupiah figure
 * comes from `/purchase-invoices/summary`, aggregated over the whole book in the
 * database; the five rows beside each worklist are a separate, deliberately
 * small read — a preview of a total computed elsewhere.
 *
 * IT REPLACED `usePayablesPanels`, which asked `/outstanding` for the same
 * totals. That endpoint answers per supplier and knows nothing about a cabang or
 * a period, so the two cards the mockup adds — the tenant's own balance and what
 * it paid this month — could not be asked for at all.
 *
 * THE CABANG SCOPES EVERY REQUEST, including the two previews: a worklist listing
 * another branch's bills under a card scoped to this one is the disagreement
 * this hook exists to prevent.
 *
 * SETTLED INDEPENDENTLY. Each list is readable without the other, and the page
 * must not go blank because one of three requests failed.
 */
export function usePayablesSummary(
  /** Skip every request when the role cannot read payables. */
  enabled: boolean,
): UsePayablesSummaryResult {
  const [query, setQueryState] =
    useState<PayablesSummaryQuery>(DEFAULT_PAYABLES_QUERY);
  const [summary, setSummary] = useState<PayablesSummary | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [pendingReceipts, setPendingReceipts] = useState<number | null>(null);
  const [overdue, setOverdue] = useState<PayablesWorklist>(EMPTY);
  const [dueSoon, setDueSoon] = useState<PayablesWorklist>(EMPTY);
  const [loading, setLoading] = useState(enabled);

  const setQuery = useCallback((patch: Partial<PayablesSummaryQuery>) => {
    setQueryState((prev) => ({ ...prev, ...patch }));
  }, []);

  const { branchId, period, dateFrom, dateTo } = query;

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    const scope = branchId ? { branchId } : {};

    Promise.allSettled([
      purchaseInvoiceService.summary({
        branchId,
        /*
          ONE OR THE OTHER, never both — the API refuses a payload carrying a
          named period beside explicit dates, because such a request does not
          say which of the two it means.
        */
        ...(period === "all"
          ? {}
          : period === "custom"
            ? { dateFrom, dateTo }
            : { period }),
      }),
      purchaseInvoiceService.list({
        ...scope,
        overdue: true,
        limit: PREVIEW_ROWS,
      }),
      purchaseInvoiceService.list({
        ...scope,
        dueSoon: true,
        limit: PREVIEW_ROWS,
      }),
      // Scoped by the same cabang as everything else on the tab; the period does
      // not touch it — a delivery still on the way is on the way whatever month
      // it is.
      goodsReceiptService.pendingCount({ branchId }),
    ]).then(([summaryResult, overdueResult, dueSoonResult, pendingResult]) => {
      if (!active) return;

      setPendingReceipts(
        pendingResult.status === "fulfilled"
          ? (pendingResult.value?.count ?? null)
          : null,
      );

      const figures =
        summaryResult.status === "fulfilled" ? summaryResult.value : null;

      setSummary(figures);
      setSummaryFailed(summaryResult.status === "rejected");

      if (overdueResult.status === "fulfilled") {
        setOverdue({
          rows: overdueResult.value.items,
          /*
            THE SERVER'S WHOLE-BOOK COUNT, not `items.length` — a worklist reading
            "3" beside three of eleven rows says the job is nearly done. The
            pager's own total is the same question asked of the same filter, so
            it stands in when the summary is the request that failed.
          */
          count:
            figures?.overdue.invoiceCount ??
            overdueResult.value.pagination.total,
          total: figures?.overdue.amount ?? null,
        });
      }

      if (dueSoonResult.status === "fulfilled") {
        setDueSoon({
          rows: dueSoonResult.value.items,
          count:
            figures?.dueSoon.invoiceCount ??
            dueSoonResult.value.pagination.total,
          total: figures?.dueSoon.amount ?? null,
        });
      }

      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [enabled, branchId, period, dateFrom, dateTo]);

  return {
    query,
    setQuery,
    summary,
    summaryFailed,
    pendingReceipts,
    overdue,
    dueSoon,
    loading,
  };
}
