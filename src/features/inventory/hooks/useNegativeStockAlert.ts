"use client";

import { useEffect, useState } from "react";

import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-error";
import type { NegativeStockRow } from "@/types/inventory";

interface UseNegativeStockAlertResult {
  /** The worst few by value — see LIMIT. */
  items: NegativeStockRow[];
  /** How many shelves are below zero across the tenant, not how many are listed. */
  total: number;
  /** What the WHOLE hole is worth. Negative — see the type. */
  shortfall: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * The top of `GET /products/negative-stock`, for the hub's "stok minus" list.
 *
 * WHAT A NEGATIVE BALANCE MEANS, because it decides how this reads. It is a sale
 * the shop recorded for goods the books did not have — allowed by default (see
 * `settings.allowNegativeStock`), and the usual cause is a delivery nobody has
 * keyed in yet rather than a theft. The number is not wrong so much as
 * INCOMPLETE, and the fix is a goods receipt or an opname.
 *
 * ONLY THE WORST FEW ROWS ARE FETCHED, like the restock list beside it: a
 * landing page answers "is there anything to do", `total` answers "how many" and
 * `shortfall` answers "how bad". All three come from the server, and the last
 * two cover every row rather than the ones on screen — a card that summed its
 * own five rows would read as the answer while being a fraction of it.
 *
 * ONE ROW IS ONE PRODUCT AT ONE WAREHOUSE, which is NOT the grain of the
 * low-stock list. A restock threshold is a property of the product, so that list
 * sums across locations; a shortfall is a discrepancy at a place, and telling
 * somebody they are three short somewhere is not something they can act on.
 */
const LIMIT = 5;

export function useNegativeStockAlert(
  enabled: boolean,
  /** Empty means every warehouse. */
  warehouseId = "",
): UseNegativeStockAlertResult {
  const [items, setItems] = useState<NegativeStockRow[]>([]);
  const [total, setTotal] = useState(0);
  const [shortfall, setShortfall] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The caller holds no `products:read`. Asking anyway would paint a 403
    // across the landing page for a section the user is simply not shown.
    if (!enabled) return;

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    productService
      // `|| undefined` so "no warehouse" drops out of the query string rather
      // than reaching the API as an empty string it would reject as a 400.
      .negativeStock({ limit: LIMIT, warehouseId: warehouseId || undefined })
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setTotal(result.pagination.total);
        setShortfall(result.shortfall);
      })
      .catch((err) => {
        if (!active) return;
        setItems([]);
        setTotal(0);
        setShortfall(null);
        setError(
          err instanceof ApiError
            ? err.message
            : "Daftar stok minus gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [enabled, warehouseId]);

  return { items, total, shortfall, loading, error };
}
