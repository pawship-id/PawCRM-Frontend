"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { stockEntryService } from "@/services/stockEntry.service";
import type { StockEntry, StockEntryKind } from "@/types/inventory";

interface UseStockEntryResult {
  entry: StockEntry | null;
  loading: boolean;
  error: string | null;
}

/**
 * One hand-typed stock document, with its lines.
 *
 * NO REFETCH, and none to add: a posted document is immutable — there is no
 * update route and no delete route — so nothing on the screen can change it and
 * a retry button would be offering to re-read a constant.
 */
export function useStockEntry(
  id: string,
  kind: StockEntryKind,
): UseStockEntryResult {
  const [entry, setEntry] = useState<StockEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    stockEntryService
      .getById(id, kind)
      .then((result) => {
        if (active) setEntry(result);
      })
      .catch((err) => {
        if (!active) return;
        setEntry(null);
        setError(
          err instanceof ApiError ? err.message : "Dokumen gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, kind]);

  return { entry, loading, error };
}
