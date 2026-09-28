"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import type {
  CustomerInvoiceListSummary,
  RevenueBreakdown,
  RevenueBreakdownAxis,
} from "@/types/api";

import {
  DEFAULT_QUERY,
  toFilterQuery,
  type CustomerInvoicesQuery,
} from "./useCustomerInvoices";

/**
 * WHAT THE RINGKASAN TAB OPENS ON — the Faktur list's query, with one field
 * changed.
 *
 * `period: "month"` WHERE THE LIST USES "all", and that is the one difference.
 * The list is a book somebody searches; this page is a period's composition, and
 * "Omzet periode" over every invoice the shop has ever raised is a figure with
 * the wrong name. Everything else is shared so the two screens' filter panel,
 * scope card and Reset behave identically.
 */
export const DEFAULT_SUMMARY_QUERY: CustomerInvoicesQuery = {
  ...DEFAULT_QUERY,
  period: "month",
};

/** The three panels, in the order the mockup draws them. */
const AXES: RevenueBreakdownAxis[] = [
  "category",
  "businessLine",
  "customerType",
];

/** One panel's data, in the three states a figure can be in. */
export interface BreakdownState {
  data: RevenueBreakdown | null;
  loading: boolean;
  failed: boolean;
}

export interface UseSalesSummaryResult {
  query: CustomerInvoicesQuery;
  summary: CustomerInvoiceListSummary | null;
  summaryFailed: boolean;
  /** True while `summary` still answers the previous filter — see the list's hook. */
  summaryStale: boolean;
  /** One entry per axis, keyed by it. */
  breakdowns: Record<RevenueBreakdownAxis, BreakdownState>;
  setQuery: (patch: Partial<CustomerInvoicesQuery>) => void;
}

const PENDING: BreakdownState = { data: null, loading: true, failed: false };

/**
 * The Ringkasan tab's data: the period's omzet, and the three answers to what it
 * was made of.
 *
 * FOUR REQUESTS, ONE FILTER KEY. Every one is built from `toFilterQuery` — the
 * same translation the list and its cards share — so the card and the bars under
 * it can never be asked different questions. None sends paging or ordering,
 * because none changes what a period adds up to.
 *
 * EACH PANEL FAILS ON ITS OWN. They are separate aggregations over separate
 * collections, and a screen that blanked all three because the lini join timed
 * out would lose two answers it actually had.
 *
 * A FAILED CALL IS NULL, NOT ZEROS. Bars drawn from a request that never
 * answered are a composition nobody can tell from a shop that sold nothing, and
 * this page's whole job is to be quoted.
 */
export function useSalesSummary(): UseSalesSummaryResult {
  const [query, setQueryState] = useState<CustomerInvoicesQuery>(
    DEFAULT_SUMMARY_QUERY,
  );
  const [summary, setSummary] = useState<CustomerInvoiceListSummary | null>(
    null,
  );
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [summaryFor, setSummaryFor] = useState<string | null>(null);
  const [breakdowns, setBreakdowns] = useState<
    Record<RevenueBreakdownAxis, BreakdownState>
  >({ category: PENDING, businessLine: PENDING, customerType: PENDING });

  // The toolbar keeps the live query so typing stays responsive; only the
  // requests wait for the search box to settle.
  const settled = useDebouncedQuery(query);

  // A string, so the effects re-run on the filter's CONTENT rather than on every
  // new object `settled` hands back.
  const filterKey = useMemo(
    () => JSON.stringify(toFilterQuery(settled)),
    [settled],
  );

  const setQuery = useCallback((patch: Partial<CustomerInvoicesQuery>) => {
    setQueryState((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSummaryFailed(false);

    customerInvoiceService
      .summary(JSON.parse(filterKey))
      .then((result) => {
        if (!active) return;
        setSummary(result);
        setSummaryFor(filterKey);
      })
      .catch(() => {
        if (!active) return;
        setSummary(null);
        setSummaryFor(filterKey);
        setSummaryFailed(true);
      });

    return () => {
      active = false;
    };
  }, [filterKey]);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBreakdowns({
      category: PENDING,
      businessLine: PENDING,
      customerType: PENDING,
    });

    const filter = JSON.parse(filterKey);

    AXES.forEach((axis) => {
      customerInvoiceService
        .revenueBreakdown(axis, filter)
        .then((data) => {
          if (!active) return;
          setBreakdowns((prev) => ({
            ...prev,
            [axis]: { data, loading: false, failed: false },
          }));
        })
        .catch(() => {
          if (!active) return;
          setBreakdowns((prev) => ({
            ...prev,
            [axis]: { data: null, loading: false, failed: true },
          }));
        });
    });

    return () => {
      active = false;
    };
  }, [filterKey]);

  return {
    query,
    summary,
    summaryFailed,
    summaryStale: summaryFor !== filterKey,
    breakdowns,
    setQuery,
  };
}
