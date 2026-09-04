"use client";

import { useCallback, useEffect, useState } from "react";

import { purchaseReturnService } from "@/services/purchaseReturn.service";
import { ApiError } from "@/services/api-error";
import type {
  PageResult,
  PurchaseReturnListQuery,
  PurchaseReturnListRow,
  PurchaseReturnSort,
  PurchaseReturnStatus,
} from "@/types/api";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/** The query knobs the list screen drives (page + the visible filters). */
export interface PurchaseReturnsQuery {
  page: number;
  search: string;
  /** "" = any supplier, otherwise a specific one. */
  supplierId: string;
  /** "" = any warehouse. */
  warehouseId: string;
  /** "" = both draft and submitted. */
  status: PurchaseReturnStatus | "";
  /** `yyyy-mm-dd`, as the date inputs hold them. "" = unbounded. */
  dateFrom: string;
  dateTo: string;
  /**
   * Which ordering the list is paged through in. Always set — a list with no
   * ordering is not a thing — so it has no "" and Reset returns it to the
   * default rather than clearing it.
   */
  sort: PurchaseReturnSort;
}

const PAGE_SIZE = 20;

const DEFAULT_QUERY: PurchaseReturnsQuery = {
  page: 1,
  search: "",
  supplierId: "",
  warehouseId: "",
  status: "",
  dateFrom: "",
  dateTo: "",
  sort: "newest",
};

/** Empty page so consumers can render a table shell before the first load. */
const EMPTY_PAGE: PageResult<PurchaseReturnListRow>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

interface UsePurchaseReturnsResult {
  returns: PurchaseReturnListRow[];
  pagination: PageResult<PurchaseReturnListRow>["pagination"];
  query: PurchaseReturnsQuery;
  loading: boolean;
  error: string | null;
  /** Merge a partial query change; any change other than `page` resets to page 1. */
  setQuery: (patch: Partial<PurchaseReturnsQuery>) => void;
  refetch: () => void;
}

/**
 * Owns the purchase-return list query state and fetching.
 *
 * Mirrors useGoodsReceipts: local state, a fetch effect keyed on the query, and
 * an explicit `refetch`. Any filter change resets to page 1 so the user is never
 * stranded on a page that no longer exists.
 *
 * `refetch` MATTERS HERE, unlike on the receipt list, because rows on this one
 * CAN be acted on: a draft may be discarded from the table, and the row has to
 * leave the list when it is. The receipt list has the same hook shape with no
 * caller for it, because a posted receipt has no edit and no delete.
 *
 * THE DATE BOUNDS ARE SENT AS THE INPUTS HOLD THEM (`yyyy-mm-dd`). The API parses
 * them against `returnDate` — the day the goods physically went back, never
 * `createdAt` — and refuses a `dateTo` earlier than `dateFrom`, which surfaces
 * here as an ordinary error rather than being second-guessed locally.
 */
export function usePurchaseReturns(
  /** Fixes a filter — e.g. one delivery's returns, or one supplier's. */
  initial: Partial<PurchaseReturnsQuery> = {},
): UsePurchaseReturnsResult {
  const [query, setQueryState] = useState<PurchaseReturnsQuery>({
    ...DEFAULT_QUERY,
    ...initial,
  });
  const [returns, setReturns] = useState<PurchaseReturnListRow[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<PurchaseReturnListRow>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to force the effect to re-run without changing query.
  const [nonce, setNonce] = useState(0);

  // The toolbar keeps the live query so typing stays responsive; only the
  // request waits for the search box to settle.
  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<PurchaseReturnsQuery>) => {
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
    // makes the late setStates safe. This mirrors the sanctioned fetch-effect
    // shape in useGoodsReceipts, so the heuristic lint rule is disabled here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const apiQuery: PurchaseReturnListQuery = {
      page: settled.page,
      limit: PAGE_SIZE,
      search: settled.search.trim() || undefined,
      supplierId: settled.supplierId || undefined,
      warehouseId: settled.warehouseId || undefined,
      status: settled.status === "" ? undefined : settled.status,
      dateFrom: settled.dateFrom || undefined,
      dateTo: settled.dateTo || undefined,
      sort: settled.sort,
    };

    purchaseReturnService
      .list(apiQuery)
      .then((result) => {
        if (!active) return;
        setReturns(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setReturns([]);
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat data retur. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settled, nonce]);

  return { returns, pagination, query, loading, error, setQuery, refetch };
}
