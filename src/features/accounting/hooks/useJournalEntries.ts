"use client";

import { useCallback, useEffect, useState } from "react";

import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";
import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import {
  journalEntryService,
  type JournalTotals,
  type JournalTotalsQuery,
} from "@/services/journalEntry.service";
import type { JournalEntry, JournalSourceType } from "@/types/accounting";
import type { Branch, PageResult } from "@/types/api";

/** The query knobs the ledger screen drives — page, plus the visible filters. */
export interface JournalEntriesQuery {
  page: number;
  /** Substring over `entryNumber` and `description`, matched server-side. */
  search: string;
  /** "" = semua sumber — the unset convention the filter layer uses. */
  sourceType: JournalSourceType | "";
  /** `yyyy-mm-dd`, as the date inputs hold them. "" = unbounded. */
  dateFrom: string;
  dateTo: string;
  /** "" = semua cabang. */
  branchId: string;
}

/**
 * 20 rows a page, the same as every other list screen here.
 *
 * The API caps a page at 100 and would happily serve one, but a bigger page only
 * postpones the split it is meant to avoid — a month still lands across two
 * pages, just less often — while making every filter change five times as
 * expensive. See the month-subtotal note in JournalEntriesScreen.
 */
const PAGE_SIZE = 20;

export const DEFAULT_JOURNAL_QUERY: JournalEntriesQuery = {
  page: 1,
  search: "",
  sourceType: "",
  dateFrom: "",
  dateTo: "",
  branchId: "",
};

/** Empty page, so the screen can render its table shell before the first load. */
const EMPTY_PAGE: PageResult<JournalEntry>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

export interface UseJournalEntriesResult {
  /** One page of the ledger, newest TRANSACTION date first. */
  entries: JournalEntry[];
  pagination: PageResult<JournalEntry>["pagination"];
  /**
   * Σdebit and Σcredit over the WHOLE filter, at every page — or null while it
   * is in flight, or when the request failed.
   *
   * Null rather than zero for "not known", because a screen that renders 0 for a
   * total it could not fetch has stated a fact about somebody's books that it
   * did not check.
   */
  totals: JournalTotals | null;
  query: JournalEntriesQuery;
  /** The branch filter's options. Empty when the user cannot read branches. */
  branches: Branch[];
  loading: boolean;
  /** Set only when the LEDGER failed — a missing branch list degrades silently. */
  error: string | null;
  /** Merge a partial change; anything but `page` returns to page 1. */
  setQuery: (patch: Partial<JournalEntriesQuery>) => void;
  refetch: () => void;
}

/**
 * The general ledger list, read from GET /journal-entries.
 *
 * EVERY FILTER IS SERVER-SIDE, which is the difference from `useChartOfAccounts`
 * next to it. A chart of accounts is tens to low hundreds of rows and can be
 * filtered in the browser; a ledger is every financial fact the tenant has ever
 * recorded and grows forever, so narrowing it here would mean paging the whole
 * book to find one entry. The endpoint takes `search`, `sourceType`, the period
 * and `branchId` directly, and each of them is a page-1 request.
 *
 * NO SORT KNOB, deliberately. The API orders by transaction date, newest first,
 * and offers no alternative — offering an ordering the server does not name is
 * how a picker ends up asking for one with no index behind it (docs/ui-rules.md
 * §8). Newest-transaction is also the right default: it differs from
 * newest-written whenever anything is backdated, and a ledger is read by the date
 * the money moved.
 *
 * THE BRANCH LIST IS FETCHED ONCE AND FAILS QUIETLY. It only labels a filter, and
 * a user may hold `journalEntries:read` without `branches:read` — a ledger that
 * refused to render because it could not fill a dropdown would be worse than one
 * whose dropdown holds only "Semua cabang". Only the ledger call sets `error`.
 */
export function useJournalEntries(): UseJournalEntriesResult {
  const [query, setQueryState] = useState<JournalEntriesQuery>(
    DEFAULT_JOURNAL_QUERY,
  );
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [pagination, setPagination] = useState(EMPTY_PAGE);
  const [totals, setTotals] = useState<JournalTotals | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to re-run the effect without a query to change.
  const [nonce, setNonce] = useState(0);

  // The toolbar keeps the live query so typing stays responsive; only the
  // request waits for the search box to settle.
  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<JournalEntriesQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      // A filter change (anything but an explicit page move) returns to page 1,
      // so nobody is stranded on a page the new filter no longer has.
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  /* ------------------------------------------- branch options, fetched once */
  useEffect(() => {
    let active = true;

    branchService
      .list({ limit: 100 })
      .then((result) => {
        if (active) setBranches(result.items);
      })
      // No setError. See the header: this list only labels a filter.
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  /**
   * The narrowing both requests share, with `""` translated to absent.
   *
   * ONE OBJECT FOR BOTH, because the total is only meaningful if it is scoped
   * exactly like the rows under it — a filter honoured by the list and not by
   * the aggregate would put an authoritative-looking figure over a different set
   * of entries. `search` is trimmed once here so the two never disagree on
   * whether a trailing space is part of the query.
   */
  const searchTerm = settled.search.trim();
  const filterQuery: JournalTotalsQuery = {
    search: searchTerm || undefined,
    // "" is this layer's "not filtering"; the API wants the key absent.
    sourceType: settled.sourceType || undefined,
    dateFrom: settled.dateFrom || undefined,
    dateTo: settled.dateTo || undefined,
    branchId: settled.branchId || undefined,
  };

  /* ------------------------------------------- the page, on every query change */
  useEffect(() => {
    let active = true;
    // The sanctioned fetch-effect shape (useGoodsReceipts, useChartOfAccounts):
    // flag the load, then synchronize with the server, with `active` guarding
    // the late setStates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    journalEntryService
      .list({
        ...filterQuery,
        page: settled.page,
        limit: PAGE_SIZE,
      })
      .then((result) => {
        if (!active) return;
        setEntries(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setEntries([]);
        setPagination(EMPTY_PAGE);
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat jurnal. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // `filterQuery` is rebuilt every render, so the effect keys on `settled` —
    // one state object that changes only when the query really does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, nonce]);

  /* ------------------------------------------ the total, on every FILTER change */
  useEffect(() => {
    let active = true;
    // Cleared rather than left showing the previous filter's figure. A stale
    // total under a new filter is the exact mistake this endpoint exists to
    // prevent, and on screen it is indistinguishable from a correct one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTotals(null);

    journalEntryService
      .totals(filterQuery)
      .then((result) => {
        if (active) setTotals(result);
      })
      // No setError and no retry button: the ROWS are the screen. A headline
      // figure that failed renders as "—", which reads as "not known" — where an
      // error banner over a table that loaded fine would say the ledger broke.
      .catch(() => undefined);

    return () => {
      active = false;
    };
    // KEYED ON THE FILTER, NOT ON `settled` — the difference is the whole point
    // of the separate endpoint. `settled` carries the page, and the total is the
    // same on page 1 as on page 7; depending on it would make the server
    // re-aggregate the entire ledger to redraw an unchanged number.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    searchTerm,
    settled.sourceType,
    settled.dateFrom,
    settled.dateTo,
    settled.branchId,
    nonce,
  ]);

  return {
    entries,
    pagination,
    totals,
    query,
    branches,
    loading,
    error,
    setQuery,
    refetch,
  };
}
