"use client";

import { useCallback, useEffect, useState } from "react";

import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";
import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { reportService } from "@/services/report.service";
import type { BusinessLine } from "@/services/businessLine.service";
import type {
  Branch,
  CommissionRowsQuery,
  CommissionRowsResult,
} from "@/types/api";

export const COMMISSION_PAGE_SIZES = [10, 25, 50, 100];

/**
 * Every field present, so the screen never has to ask "is it set". `search` is
 * the API's `q` — named for `useDebouncedQuery`, which waits on that key only.
 */
export type CommissionsQuery = Required<
  Pick<
    CommissionRowsQuery,
    | "branchId"
    | "businessLineId"
    | "dateFrom"
    | "dateTo"
    | "status"
    | "sort"
    | "dir"
    | "page"
    | "limit"
  >
> & { search: string };

/**
 * OPENS ON THE NEWEST BOOKING, UNFILTERED — like every other Keuangan screen.
 * A default of "this month" on a tenant whose commission starts in June would
 * open on an empty September that reads as "nothing here".
 */
export const DEFAULT_COMMISSIONS_QUERY: CommissionsQuery = {
  branchId: "",
  businessLineId: "",
  dateFrom: "",
  dateTo: "",
  status: "",
  search: "",
  sort: "bookingDate",
  dir: "desc",
  page: 1,
  limit: 10,
};

export interface UseCommissionsResult {
  data: CommissionRowsResult | null;
  query: CommissionsQuery;
  branches: Branch[];
  businessLines: BusinessLine[];
  loading: boolean;
  error: string | null;
  /** Any change other than the page itself goes back to page one. */
  setQuery: (patch: Partial<CommissionsQuery>) => void;
  refetch: () => void;
}

/**
 * The Komisi screen's state: the query, the page it answered, and the two
 * lookups the context bar needs.
 *
 * THE SEARCH IS DEBOUNCED, the rest is not — `useDebouncedQuery` settles the
 * whole query, which is what keeps a typed name from firing one request per key.
 */
export function useCommissions(): UseCommissionsResult {
  const [query, setQueryState] = useState<CommissionsQuery>(
    DEFAULT_COMMISSIONS_QUERY,
  );
  const [data, setData] = useState<CommissionRowsResult | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<CommissionsQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  /*
    LOOKUPS, ONCE. A user without `businessLines:read` gets a Lini select holding
    only "Semua" — honest: it is not filtering, because it cannot.
  */
  useEffect(() => {
    let active = true;

    Promise.allSettled([
      branchService.list({ limit: 100 }),
      businessLineService.list({ limit: 100 }),
    ]).then(([branchResult, lineResult]) => {
      if (!active) return;
      if (branchResult.status === "fulfilled") setBranches(branchResult.value.items);
      if (lineResult.status === "fulfilled") setBusinessLines(lineResult.value.items);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    reportService
      .commissionRecords({ ...settled, q: settled.search })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError && err.status === 403
            ? "Akun Anda tidak punya izin membaca data staf, dan komisi termasuk di dalamnya."
            : err instanceof ApiError
              ? err.fullMessage
              : "Komisi tidak bisa dimuat. Coba lagi.",
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
    data,
    query,
    branches,
    businessLines,
    loading,
    error,
    setQuery,
    refetch,
  };
}
