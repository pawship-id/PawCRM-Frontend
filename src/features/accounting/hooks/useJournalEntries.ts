"use client";

import { useCallback, useEffect, useState } from "react";

import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";
import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import { journalEntryService } from "@/services/journalEntry.service";
import type {
  JournalEntry,
  JournalEntrySort,
  JournalSourceType,
} from "@/types/accounting";
import type { Branch, PageResult } from "@/types/api";

/** The query knobs the ledger screen drives — page, plus the visible filters. */
export interface JournalEntriesQuery {
  page: number;
  /** Rows a page — the footer's size control. One of JOURNAL_PAGE_SIZES. */
  limit: number;
  /**
   * Matched server-side over the entry number, the keterangan, the source
   * document's number and the branch name — everything the row shows as text.
   */
  search: string;
  /** "" = semua sumber — the unset convention the filter layer uses. */
  sourceType: JournalSourceType | "";
  /** `yyyy-mm-dd`, as the context bar holds them. "" = unbounded. */
  dateFrom: string;
  dateTo: string;
  /** "" = semua cabang. */
  branchId: string;
  /**
   * Which ordering to page through — set by the column headers. Always set: a
   * list has no "unordered" state, which is why this one is not `""`-able.
   */
  sort: JournalEntrySort;
}

/**
 * The footer's page sizes — Kas & Bank's, so the two lists of one module offer
 * the same choice (the mockup's 10 was dropped there for the same reason: a
 * page of ten on a ledger is a page of paging).
 */
export const JOURNAL_PAGE_SIZES = [25, 50, 100];

export const DEFAULT_JOURNAL_QUERY: JournalEntriesQuery = {
  page: 1,
  limit: JOURNAL_PAGE_SIZES[0],
  search: "",
  sourceType: "",
  dateFrom: "",
  dateTo: "",
  branchId: "",
  sort: "newest",
};

/** Empty page, so the screen can render its table shell before the first load. */
const EMPTY_PAGE: PageResult<JournalEntry>["pagination"] = {
  page: 1,
  limit: DEFAULT_JOURNAL_QUERY.limit,
  total: 0,
  totalPages: 0,
};

export interface UseJournalEntriesResult {
  entries: JournalEntry[];
  pagination: PageResult<JournalEntry>["pagination"];
  query: JournalEntriesQuery;
  /** Branch options for the context bar. Empty if the user cannot read them. */
  branches: Branch[];
  loading: boolean;
  error: string | null;
  /** Patch the query. Any change other than `page` itself resets to page 1. */
  setQuery: (patch: Partial<JournalEntriesQuery>) => void;
  refetch: () => void;
}

/**
 * GET /journal-entries, driven by the Jurnal screen's context bar, search,
 * Sumber filter, column headers and footer.
 *
 * NO TOTALS ANY MORE. The Entri / Total debit tiles went with the mockup
 * (21 September 2026); `journalEntryService.totals` stays for whoever needs a
 * figure over a filtered ledger, but this screen no longer asks for one.
 *
 * Search is debounced through `useDebouncedQuery`, so typing does not fire a
 * request per keystroke; every other change applies at once.
 */
export function useJournalEntries(): UseJournalEntriesResult {
  const [query, setQueryState] = useState<JournalEntriesQuery>(
    DEFAULT_JOURNAL_QUERY,
  );
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [pagination, setPagination] = useState(EMPTY_PAGE);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<JournalEntriesQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      // A new filter, ordering or page size starts from the top; only paging
      // itself moves the page.
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
      // A user who cannot read branches still gets a working ledger — the bar
      // just offers "Semua cabang" alone.
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

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
        search: settled.search.trim() || undefined,
        sourceType: settled.sourceType || undefined,
        dateFrom: settled.dateFrom || undefined,
        dateTo: settled.dateTo || undefined,
        branchId: settled.branchId || undefined,
        sort: settled.sort,
        page: settled.page,
        limit: settled.limit,
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
  }, [settled, nonce]);

  return {
    entries,
    pagination,
    query,
    branches,
    loading,
    error,
    setQuery,
    refetch,
  };
}
