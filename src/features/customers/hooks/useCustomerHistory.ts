"use client";

import { useCallback, useEffect, useState } from "react";

import { customerService } from "@/services/customer.service";
import { ApiError } from "@/services/api-error";
import type {
  CustomerHistoryKind,
  CustomerHistoryRow,
  CustomerHistorySort,
  CustomerHistorySource,
  PageResult,
} from "@/types/api";

/** `""` means "not filtering", the repo's convention for a cleared control. */
export interface CustomerHistoryQuery {
  search: string;
  dateFrom: string;
  dateTo: string;
  kind: CustomerHistoryKind | "";
  source: CustomerHistorySource | "";
  sort: CustomerHistorySort;
  page: number;
}

const LIMIT = 20;

export const DEFAULT_HISTORY_QUERY: CustomerHistoryQuery = {
  search: "",
  dateFrom: "",
  dateTo: "",
  kind: "",
  source: "",
  sort: "dateDesc",
  page: 1,
};

const EMPTY_PAGE: PageResult<never>["pagination"] = {
  page: 1,
  limit: LIMIT,
  total: 0,
  totalPages: 0,
};

interface UseCustomerHistoryResult {
  items: CustomerHistoryRow[];
  pagination: PageResult<never>["pagination"];
  query: CustomerHistoryQuery;
  loading: boolean;
  error: string | null;
  setQuery: (patch: Partial<CustomerHistoryQuery>) => void;
  refetch: () => void;
}

/**
 * The Riwayat tab's list — every customer's services, purchases and
 * back-office invoices, newest first, paged and filtered on the server.
 *
 * ANY FILTER OR SORT CHANGE RESETS TO PAGE 1, as every other list here does: page 3 of
 * a narrower list is whatever happens to land there.
 */
export function useCustomerHistory(): UseCustomerHistoryResult {
  const [query, setQueryState] = useState<CustomerHistoryQuery>(DEFAULT_HISTORY_QUERY);
  const [items, setItems] = useState<CustomerHistoryRow[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<never>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const setQuery = useCallback((patch: Partial<CustomerHistoryQuery>) => {
    setQueryState((prev) => ({ ...prev, ...patch, page: patch.page ?? 1 }));
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    customerService
      .history({
        search: query.search || undefined,
        dateFrom: query.dateFrom || undefined,
        dateTo: query.dateTo || undefined,
        kind: query.kind || undefined,
        source: query.source || undefined,
        sort: query.sort,
        page: query.page,
        limit: LIMIT,
      })
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setItems([]);
        setError(
          err instanceof ApiError ? err.message : "Riwayat pelanggan gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    query.search,
    query.dateFrom,
    query.dateTo,
    query.kind,
    query.source,
    query.sort,
    query.page,
    nonce,
  ]);

  return { items, pagination, query, loading, error, setQuery, refetch };
}
