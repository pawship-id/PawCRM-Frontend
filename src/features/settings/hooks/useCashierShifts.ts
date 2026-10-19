"use client";

import { useCallback, useEffect, useState } from "react";

import { posService } from "@/services/pos.service";
import { ApiError } from "@/services/api-error";
import type { PageResult, PosShiftListItem, PosShiftStatus } from "@/types/api";

/** The query knobs Pengaturan › Shift kasir drives. */
export interface CashierShiftsQuery {
  page: number;
  /** "" means every status. */
  status: PosShiftStatus | "";
  /** "" means every branch the server lets this user read. */
  branchId: string;
}

/**
 * OPENS ON "MASIH BUKA" — the question this page exists for is "which shift is
 * still hanging", and Beranda's card only counts shifts opened today, so a
 * shift left open yesterday is invisible everywhere else.
 */
const DEFAULT_QUERY: CashierShiftsQuery = { page: 1, status: "open", branchId: "" };

const EMPTY_PAGE: PageResult<PosShiftListItem>["pagination"] = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

/**
 * Owns the shift list's query and fetching. Read-only — closing a shift stays
 * on the till, by the cashier who opened it — so `refetch` is only the manual
 * reload. Mirrors useAuditLogs.
 */
export function useCashierShifts() {
  const [query, setQueryState] = useState<CashierShiftsQuery>(DEFAULT_QUERY);
  const [shifts, setShifts] = useState<PosShiftListItem[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<PosShiftListItem>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const setQuery = useCallback((patch: Partial<CashierShiftsQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    posService
      .listShifts({
        page: query.page,
        limit: 20,
        status: query.status || undefined,
        branchId: query.branchId || undefined,
      })
      .then((result) => {
        if (!active) return;
        setShifts(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setShifts([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Gagal memuat shift kasir. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query, nonce]);

  return { shifts, pagination, query, loading, error, setQuery, refetch };
}
