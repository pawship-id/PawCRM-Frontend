"use client";

import { useCallback, useEffect, useState } from "react";

import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { ApiError } from "@/services/api-error";
import type {
  GoodsReceiptListQuery,
  GoodsReceiptListRow,
  GoodsReceiptSort,
  PageResult,
  PurchaseType,
} from "@/types/api";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/** The query knobs the list screen drives (page + the visible filters). */
export interface GoodsReceiptsQuery {
  page: number;
  search: string;
  /** "" = any supplier, otherwise a specific one. */
  supplierId: string;
  /** "" = any warehouse. */
  warehouseId: string;
  /**
   * "" = any branch.
   *
   * NOT A SYNONYM FOR `warehouseId`, which is why both exist: a branch may
   * receive at its own warehouse AND at the shared central one, so "what did
   * this shop buy" spans warehouses rather than naming one. They narrow along
   * different axes and combine.
   */
  branchId: string;
  /** "" = both purchase types. */
  purchaseType: PurchaseType | "";
  /** `yyyy-mm-dd`, as the date inputs hold them. "" = unbounded. */
  dateFrom: string;
  dateTo: string;
  /**
   * Which ordering the list is paged through in. Always set — a list with no
   * ordering is not a thing — so it has no "" and Reset returns it to the
   * default rather than clearing it.
   */
  sort: GoodsReceiptSort;
}

const PAGE_SIZE = 20;

const DEFAULT_QUERY: GoodsReceiptsQuery = {
  page: 1,
  search: "",
  supplierId: "",
  warehouseId: "",
  branchId: "",
  purchaseType: "",
  dateFrom: "",
  dateTo: "",
  sort: "newest",
};

/** Empty page so consumers can render a table shell before the first load. */
const EMPTY_PAGE: PageResult<GoodsReceiptListRow>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

interface UseGoodsReceiptsResult {
  receipts: GoodsReceiptListRow[];
  pagination: PageResult<GoodsReceiptListRow>["pagination"];
  query: GoodsReceiptsQuery;
  loading: boolean;
  error: string | null;
  /** Merge a partial query change; any change other than `page` resets to page 1. */
  setQuery: (patch: Partial<GoodsReceiptsQuery>) => void;
  refetch: () => void;
}

/**
 * Owns the goods-receipt list query state and fetching.
 *
 * Mirrors useSuppliers: local state, a fetch effect keyed on the query, and an
 * explicit `refetch`. Any filter change resets to page 1 so the user is never
 * stranded on a page that no longer exists.
 *
 * NO `includeDeleted`, unlike useSuppliers, and no row mutations for `refetch` to
 * follow. A posted receipt cannot be edited or deleted — see
 * goodsReceiptService — so the only thing that changes this list is a NEW
 * delivery. `refetch` is here for the screen to call after one is created
 * elsewhere, not because a row on it can be acted on.
 *
 * THE DATE BOUNDS ARE SENT AS THE INPUTS HOLD THEM (`yyyy-mm-dd`). The API parses
 * them as ISO dates against `receiptDate` — the day the goods arrived, never
 * `createdAt` — and refuses a `dateTo` earlier than `dateFrom`, which surfaces
 * here as an ordinary error rather than being second-guessed locally.
 */
export function useGoodsReceipts(
  /** Fixes the supplier filter — the supplier detail screen's delivery history. */
  initial: Partial<GoodsReceiptsQuery> = {},
): UseGoodsReceiptsResult {
  const [query, setQueryState] = useState<GoodsReceiptsQuery>({
    ...DEFAULT_QUERY,
    ...initial,
  });
  const [receipts, setReceipts] = useState<GoodsReceiptListRow[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<GoodsReceiptListRow>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to force the effect to re-run without changing query.
  const [nonce, setNonce] = useState(0);

  // The toolbar keeps the live query so typing stays responsive; only the
  // request waits for the search box to settle.
  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<GoodsReceiptsQuery>) => {
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
    // shape in useSuppliers, so the heuristic lint rule is disabled here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const apiQuery: GoodsReceiptListQuery = {
      page: settled.page,
      limit: PAGE_SIZE,
      search: settled.search.trim() || undefined,
      supplierId: settled.supplierId || undefined,
      warehouseId: settled.warehouseId || undefined,
      branchId: settled.branchId || undefined,
      purchaseType: settled.purchaseType === "" ? undefined : settled.purchaseType,
      dateFrom: settled.dateFrom || undefined,
      dateTo: settled.dateTo || undefined,
      sort: settled.sort,
    };

    goodsReceiptService
      .list(apiQuery)
      .then((result) => {
        if (!active) return;
        setReceipts(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setReceipts([]);
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat data penerimaan. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settled, nonce]);

  return { receipts, pagination, query, loading, error, setQuery, refetch };
}
