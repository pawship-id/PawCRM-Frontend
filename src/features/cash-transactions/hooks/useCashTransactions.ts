"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";
import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { paymentChannelService } from "@/services/paymentChannel.service";
import type {
  Branch,
  CashTransaction,
  CashTransactionTotals,
  PageResult,
  PaymentChannel,
} from "@/types/api";

import {
  DEFAULT_CASH_TRANSACTIONS_QUERY,
  type CashTransactionsQuery,
} from "../query";

const PAGE_SIZE = 20;

const EMPTY_PAGE: PageResult<CashTransaction>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

export interface UseCashTransactionsResult {
  transactions: CashTransaction[];
  pagination: PageResult<CashTransaction>["pagination"];
  /**
   * Posted money in and out over the WHOLE filter — or null while a new filter
   * is in flight or after a failure. Null, not zero: a card reading Rp 0 for a
   * figure nobody fetched states a fact about somebody's cash that is untrue.
   */
  totals: CashTransactionTotals | null;
  query: CashTransactionsQuery;
  /** Filter options. Empty when the user cannot read them — never an error. */
  branches: Branch[];
  channels: PaymentChannel[];
  loading: boolean;
  error: string | null;
  /** Merge a change; anything but `page` returns to page 1. */
  setQuery: (patch: Partial<CashTransactionsQuery>) => void;
  refetch: () => void;
}

/**
 * The Transaksi Keuangan list, from GET /cash-transactions.
 *
 * EVERY FILTER IS SERVER-SIDE — the collection grows with every sale. ONE
 * REQUEST carries the rows and the totals, so the cards and the table cannot be
 * scoped differently.
 *
 * THE TOTALS CLEAR ON A FILTER CHANGE, not on a page turn: they do not depend on
 * the page, and a stale figure under a new filter looks exactly like a right one.
 *
 * Branches and channels only label filters, so they are fetched once and fail
 * quietly — a user may read transactions without `branches:read`.
 */
export function useCashTransactions(
  initial: Partial<CashTransactionsQuery> = {},
): UseCashTransactionsResult {
  const [query, setQueryState] = useState<CashTransactionsQuery>(() => ({
    ...DEFAULT_CASH_TRANSACTIONS_QUERY,
    ...initial,
  }));
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [pagination, setPagination] = useState(EMPTY_PAGE);
  const [totals, setTotals] = useState<CashTransactionTotals | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const settled = useDebouncedQuery(query);
  const lastFilterKey = useRef<string | null>(null);

  const setQuery = useCallback((patch: Partial<CashTransactionsQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;

    branchService
      .list({ limit: 100 })
      .then((result) => {
        if (active) setBranches(result.items);
      })
      .catch(() => undefined);

    // Inactive channels included: last year's rows still name them.
    paymentChannelService
      .list({ limit: 100 })
      .then((result) => {
        if (active) setChannels(result.items);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const search = settled.search.trim();

    // Everything that narrows the set — the page and the ordering do not.
    const filterKey = JSON.stringify({
      ...settled,
      search,
      page: undefined,
      sort: undefined,
    });

    // The sanctioned fetch-effect shape (useJournalEntries): flag the load,
    // then synchronize with the server, `active` guarding the late setStates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    if (filterKey !== lastFilterKey.current) setTotals(null);
    lastFilterKey.current = filterKey;

    cashTransactionService
      .list({
        page: settled.page,
        limit: PAGE_SIZE,
        sort: settled.sort,
        search: search || undefined,
        direction: settled.direction || undefined,
        kind: settled.kinds.length > 0 ? settled.kinds : undefined,
        dateFrom: settled.dateFrom || undefined,
        dateTo: settled.dateTo || undefined,
        branchId: settled.branchId || undefined,
        channelId: settled.channelId || undefined,
        status: settled.status || undefined,
        documentId: settled.documentId || undefined,
      })
      .then((result) => {
        if (!active) return;
        setTransactions(result.items);
        setPagination(result.pagination);
        setTotals(result.totals ?? null);
      })
      .catch((err) => {
        if (!active) return;
        setTransactions([]);
        setPagination(EMPTY_PAGE);
        setTotals(null);
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat transaksi. Coba lagi.",
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
    transactions,
    pagination,
    totals,
    query,
    branches,
    channels,
    loading,
    error,
    setQuery,
    refetch,
  };
}
