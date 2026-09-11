"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { customerInvoiceService } from "@/services/customerInvoice.service";
import { ApiError } from "@/services/api-error";
import type {
  CustomerInvoiceListQuery,
  CustomerInvoiceListRow,
  CustomerInvoiceListSummary,
  CustomerInvoiceSource,
  CustomerInvoiceStatusFilter,
  InvoicePeriod,
  PageResult,
} from "@/types/api";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/**
 * The Periode field:
 *
 *   all    — every date. The screen's default; nothing about dates is sent.
 *   today / week / month — a period the SERVER resolves by name.
 *   custom — dates somebody typed. With neither end typed it also means every
 *            date, an honest reading of a range nobody has bounded yet.
 */
export type InvoicePeriodChoice = InvoicePeriod | "all" | "custom";

/** The orderings the API accepts — CUSTOMER_INVOICE_SORTS in the model. */
export type CustomerInvoiceSort = NonNullable<CustomerInvoiceListQuery["sort"]>;

/** What the footer's "per halaman" offers. 200 is this list's server ceiling. */
export const PAGE_SIZES = [25, 50, 100, 200] as const;

/** Everything the Penjualan list screen can set. */
export interface CustomerInvoicesQuery {
  page: number;
  pageSize: number;
  search: string;
  /**
   * THE SCOPE — Cabang and Gudang in the filter panel. Unlike the other panel
   * fields, these also narrow the "Belum lunas" and "Lewat jatuh tempo" cards,
   * because they change whose books are being read, not which rows are shown.
   */
  branchId: string;
  warehouseId: string;
  period: InvoicePeriodChoice;
  /** `yyyy-mm-dd`. Only read when `period` is `custom`; "" = unbounded. */
  dateFrom: string;
  dateTo: string;
  /** The rest of the filter panel. Each empty array / "" means "not filtering". */
  createdBy: string[];
  source: CustomerInvoiceSource | "";
  statuses: CustomerInvoiceStatusFilter[];
  /**
   * Always set — a list with no ordering is not a thing. Driven by the column
   * headers, independent of every filter.
   */
  sort: CustomerInvoiceSort;
}

export const DEFAULT_QUERY: CustomerInvoicesQuery = {
  page: 1,
  pageSize: PAGE_SIZES[0],
  search: "",
  branchId: "",
  warehouseId: "",
  /*
    EVERY INVOICE, EVERY STATUS, EVERY DATE — asked for on 11 Sep 2026, after a
    first version opened on "Bulan ini". The table is the whole book until
    somebody narrows it; the period, like every other filter, is one panel away,
    and the scope card says "Semua tanggal" so nobody mistakes it for a month.
  */
  period: "all",
  dateFrom: "",
  dateTo: "",
  createdBy: [],
  source: "",
  statuses: [],
  /*
    SOONEST DUE FIRST — who has waited longest. The endpoint's own default, and
    what the Jatuh tempo header shows as sorted when the screen opens.
  */
  sort: "dueSoonest",
};

/** Empty page so consumers can render a table shell before the first load. */
const EMPTY_PAGE: PageResult<CustomerInvoiceListRow>["pagination"] = {
  page: 1,
  limit: PAGE_SIZES[0],
  total: 0,
  totalPages: 0,
};

const nonEmpty = <T,>(values: T[]) => (values.length > 0 ? values : undefined);

/**
 * The screen's query as the API's FILTER — everything but paging and ordering.
 *
 * ONE TRANSLATION FOR THE LIST AND THE CARDS. Both requests are built from this,
 * so a filter the table honours can never be silently ignored by the figures
 * above it.
 *
 * A NAMED PERIOD GOES OVER THE WIRE AS ITS NAME, never as dates the browser
 * worked out. The month is cut in the tenant's timezone, which is not the
 * reader's often enough to matter on the first and last day of every month.
 */
export function toFilterQuery(
  query: CustomerInvoicesQuery,
): Omit<CustomerInvoiceListQuery, "page" | "limit" | "sort"> {
  return {
    search: query.search.trim() || undefined,
    branchId: query.branchId || undefined,
    warehouseId: query.warehouseId || undefined,
    createdBy: nonEmpty(query.createdBy),
    source: query.source || undefined,
    statuses: nonEmpty(query.statuses),
    ...(query.period === "all"
      ? {}
      : query.period === "custom"
        ? {
            dateFrom: query.dateFrom || undefined,
            dateTo: query.dateTo || undefined,
          }
        : { period: query.period }),
  };
}

interface UseCustomerInvoicesResult {
  invoices: CustomerInvoiceListRow[];
  pagination: PageResult<CustomerInvoiceListRow>["pagination"];
  query: CustomerInvoicesQuery;
  loading: boolean;
  error: string | null;
  /** The four cards. Null while the first answer is on its way, or after a failure. */
  summary: CustomerInvoiceListSummary | null;
  summaryFailed: boolean;
  /**
   * True while `summary` still answers the PREVIOUS filter — the moment between
   * a filter change and the new figures arriving. The cards keep the old numbers
   * rather than flashing dashes; a caption naming the period must not keep the
   * old period's dates.
   */
  summaryStale: boolean;
  /** Merge a partial query change; any change other than `page` resets to page 1. */
  setQuery: (patch: Partial<CustomerInvoicesQuery>) => void;
  /** Re-asks for both the rows and the cards — after a payment or a void. */
  refetch: () => void;
}

/**
 * Owns the Penjualan list: its query, its rows and the cards above them.
 *
 * TWO REQUESTS, KEYED DIFFERENTLY. The rows change with paging and ordering; the
 * cards do not, so the summary is keyed on the FILTER alone and turning a page
 * does not re-sum a month of invoices.
 *
 * `refetch` refreshes BOTH. Recording a payment moves a row's Sisa and the
 * Tertagih card in the same breath; refreshing one would leave the screen
 * disagreeing with itself until the next filter change.
 */
export function useCustomerInvoices(
  initial: Partial<CustomerInvoicesQuery> = {},
): UseCustomerInvoicesResult {
  const [query, setQueryState] = useState<CustomerInvoicesQuery>({
    ...DEFAULT_QUERY,
    ...initial,
  });
  const [invoices, setInvoices] = useState<CustomerInvoiceListRow[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<CustomerInvoiceListRow>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CustomerInvoiceListSummary | null>(
    null,
  );
  const [summaryFailed, setSummaryFailed] = useState(false);
  // The filter key the current `summary` was answered for.
  const [summaryFor, setSummaryFor] = useState<string | null>(null);
  // Bumped by refetch() to force both effects to re-run without changing query.
  const [nonce, setNonce] = useState(0);

  // The toolbar keeps the live query so typing stays responsive; only the
  // requests wait for the search box to settle.
  const settled = useDebouncedQuery(query);

  /*
    A STRING, so the summary effect re-runs when the filter's CONTENT changes
    rather than whenever `settled` is a new object — which it is after every
    page turn.
  */
  const filterKey = useMemo(
    () => JSON.stringify(toFilterQuery(settled)),
    [settled],
  );

  const setQuery = useCallback((patch: Partial<CustomerInvoicesQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      // A filter change (anything but an explicit page move) returns to page 1.
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // The query changed (or refetch bumped the nonce): show the loading state,
    // then synchronize with the server. The stale-response guard (`active`)
    // makes the late setStates safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    customerInvoiceService
      .list({
        ...toFilterQuery(settled),
        page: settled.page,
        limit: settled.pageSize,
        sort: settled.sort,
      })
      .then((result) => {
        if (!active) return;
        setInvoices(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setInvoices([]);
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat daftar faktur. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settled, nonce]);

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
        setSummaryFor(filterKey);
        /*
          NULL, NOT ZEROS. A card reading "Rp 0" for a request that never
          answered is a confident wrong number; the cards render a dash and say
          the figure did not load. The list itself is unaffected.
        */
        setSummary(null);
        setSummaryFailed(true);
      });

    return () => {
      active = false;
    };
  }, [filterKey, nonce]);

  return {
    invoices,
    pagination,
    query,
    loading,
    error,
    summary,
    summaryFailed,
    summaryStale: summaryFor !== filterKey,
    setQuery,
    refetch,
  };
}
