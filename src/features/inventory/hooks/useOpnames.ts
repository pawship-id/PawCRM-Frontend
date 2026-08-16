"use client";

import { useEffect, useState } from "react";

import { stockOpnameService } from "@/services/stockOpname.service";
import { ApiError } from "@/services/api-error";
import type {
  Opname,
  OpnamePage,
  OpnameSort,
  OpnameStatus,
} from "@/types/inventory";

/** The filters the opname toolbar drives. Empty string = unset. */
export interface OpnameFilters {
  search: string;
  warehouseId: string;
  status: OpnameStatus | "";
  /** `yyyy-mm-dd` from a date input, or "". */
  dateFrom: string;
  dateTo: string;
  /** Which ordering to page through. */
  sort: OpnameSort;
}

export const EMPTY_OPNAME_FILTERS: OpnameFilters = {
  search: "",
  warehouseId: "",
  status: "",
  dateFrom: "",
  dateTo: "",
  // The API's own default, restated rather than left out: the panel renders the
  // current value, and a select whose value is `undefined` shows nothing.
  sort: "newest",
};

const PAGE_SIZE = 20;

const EMPTY_PAGINATION: OpnamePage["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

interface UseOpnamesResult {
  /** One page of HEADERS — the API projects `items` away. */
  opnames: Opname[];
  pagination: OpnamePage["pagination"];
  loading: boolean;
  error: string | null;
}

/**
 * A page of count sheets: filters and a page number in, one page out.
 *
 * The sanctioned fetch-effect shape in this codebase (see useStockCard): show
 * loading, synchronize, guard the late setStates with `active`.
 *
 * NOTHING IS COMPUTED HERE. `itemCount`, `countedCount` and `warehouseName`
 * arrive resolved from the API, so the list renders in full without fetching a
 * single sheet — which is the whole reason the server computes them rather than
 * shipping a thousand-line array per row for the browser to call `.length` on.
 */
export function useOpnames(
  filters: OpnameFilters,
  page: number,
  /** Bumped by the screen after a create or a delete, to re-read the page. */
  refreshKey: number,
): UseOpnamesResult {
  const [opnames, setOpnames] = useState<Opname[]>([]);
  const [pagination, setPagination] =
    useState<OpnamePage["pagination"]>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { search, warehouseId, status, dateFrom, dateTo, sort } = filters;

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    stockOpnameService
      .list({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        warehouseId: warehouseId || undefined,
        status: status || undefined,
        // The inputs give a date; the API bounds `opnameDate`, a timestamp.
        // `dateTo` is pushed to the end of its day so "sampai 3 Agustus"
        // includes the sheets counted on the 3rd rather than only midnight.
        sort,
        dateFrom: dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined,
        dateTo: dateTo ? `${dateTo}T23:59:59.999Z` : undefined,
      })
      .then((result) => {
        if (!active) return;
        setOpnames(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setOpnames([]);
        setPagination(EMPTY_PAGINATION);
        setError(
          err instanceof ApiError
            ? err.message
            : "Daftar opname gagal dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [search, warehouseId, status, dateFrom, dateTo, sort, page, refreshKey]);

  return { opnames, pagination, loading, error };
}
