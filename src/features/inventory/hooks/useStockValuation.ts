"use client";

import { useEffect, useState } from "react";

import { reportService } from "@/services/report.service";
import { ApiError } from "@/services/api-error";
import type { StockOnHandResult, StockOnHandTotals } from "@/types/report";

/** One warehouse and what its shelves are worth. */
export interface WarehouseValue {
  warehouseId: string;
  name: string;
  value: string;
  qty: string;
}

interface UseStockValuationResult {
  /** Every shelf in scope, or the one chosen — see the hook. */
  totals: StockOnHandTotals | null;
  /** Largest first. Empty while a single warehouse is chosen — see below. */
  perWarehouse: WarehouseValue[];
  loading: boolean;
  error: string | null;
}

/**
 * What the stock is worth: one headline figure, and the same figure per gudang.
 *
 * THE TOTALS COME FROM `pagination`-FREE HEADERS, not from adding rows up.
 * `/reports/stock-on-hand` answers `totals` over the WHOLE filtered set however
 * few rows are asked for, so `limit: 1` costs a small query and still reports
 * the true valuation — the trick every count on this module plays.
 *
 * ONE CALL PER WAREHOUSE FOR THE BREAKDOWN, and that is a deliberate trade. The
 * report's rows are per (product, warehouse), so a per-warehouse total could
 * only be had client-side by paging the entire catalogue — which is the mistake
 * the totals exist to prevent. A tenant has a handful of warehouses, each answer
 * is one small query, and they are fired together.
 *
 * NO BREAKDOWN WHILE ONE WAREHOUSE IS CHOSEN: the headline already IS that
 * warehouse's, and a one-bar chart under it says nothing twice.
 */
export function useStockValuation(
  enabled: boolean,
  warehouseId: string,
  /** Empty means every cabang. Narrows both the headline and the breakdown. */
  branchId: string,
  warehouses: Array<{ _id: string; name: string }>,
): UseStockValuationResult {
  const [totals, setTotals] = useState<StockOnHandTotals | null>(null);
  const [perWarehouse, setPerWarehouse] = useState<WarehouseValue[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  // The ids, as one string: the effect must re-run when the LIST changes, not
  // whenever the array identity does.
  const warehouseKey = warehouses.map((row) => row._id).join(",");

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const breakdown = warehouseId ? [] : warehouses;

    /*
      SETTLED INDEPENDENTLY, AND THIS IS THE WHOLE POINT OF THE FAN-OUT BEING
      SAFE. `/reports/stock-on-hand` answers 403 for a warehouse outside the
      caller's reach, and the picker above this card can legitimately list one —
      it shows what the tenant has, while the report enforces what this account
      may read. With `Promise.all` that single refusal rejected the batch and
      the HEADLINE went with it: the card read "—" over a shop with stock in it,
      which is the one thing a valuation must never do.

      A refused warehouse now simply drops out of the breakdown, and the total
      stays the server's own answer for everything in reach.
    */
    Promise.allSettled([
      reportService.stockOnHand({
        warehouseId: warehouseId || undefined,
        branchId: branchId || undefined,
        limit: 1,
      }),
      ...breakdown.map((warehouse) =>
        reportService
          .stockOnHand({ warehouseId: warehouse._id, limit: 1 })
          .then((result) => ({ warehouse, result })),
      ),
    ]).then(([headline, ...rest]) => {
      if (!active) return;

      if (headline.status === "fulfilled") {
        const result = headline.value as StockOnHandResult;
        setTotals(result.totals);
        setError(null);
      } else {
        /*
          ONLY THE HEADLINE'S FAILURE IS AN ERROR ON SCREEN. A breakdown row
          that could not be read is a bar missing from a chart; the figure the
          card exists for is this one.
        */
        setTotals(null);
        setError(
          headline.reason instanceof ApiError
            ? headline.reason.fullMessage
            : "Gagal memuat nilai persediaan. Coba lagi.",
        );
      }

      setPerWarehouse(
        rest
          .filter(
            (
              entry,
            ): entry is PromiseFulfilledResult<{
              warehouse: { _id: string; name: string };
              result: StockOnHandResult;
            }> => entry.status === "fulfilled",
          )
          .map(({ value }) => ({
            warehouseId: value.warehouse._id,
            name: value.warehouse.name,
            value: value.result.totals.value,
            qty: value.result.totals.qty,
          }))
          /* Empty shelves are left out rather than drawn as a zero bar: a
             warehouse holding nothing is not a share of the valuation. */
          .filter((row) => Number(row.value) > 0)
          .sort((a, b) => Number(b.value) - Number(a.value)),
      );

      setLoading(false);
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, warehouseId, branchId, warehouseKey]);

  return { totals, perWarehouse, loading, error };
}
