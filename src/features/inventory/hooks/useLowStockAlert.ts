"use client";

import { useEffect, useState } from "react";

import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-error";
import type { Product } from "@/types/inventory";

/** A catalogue row plus the quantity that put it below its threshold. */
export type LowStockProduct = Product & { qtyOnHand: string };

interface UseLowStockAlertResult {
  /** The most urgent few — see LIMIT. */
  items: LowStockProduct[];
  /** How many products are low ACROSS the tenant, not how many are listed. */
  total: number;
  loading: boolean;
  error: string | null;
}

/**
 * The top of `GET /products/low-stock`, for the hub's "perlu restock" list.
 *
 * ONLY THE FIRST FEW ROWS ARE FETCHED. The hub is a landing page, not a report:
 * it answers "is there anything to do today", and the count answers "how much".
 * `pagination.total` covers every low product whatever the page size, so asking
 * for five costs one small query and still reports the true figure.
 *
 * THE THRESHOLD IS PER PRODUCT, NOT PER WAREHOUSE, and this hook does not filter
 * by warehouse for that reason. `minStock` lives on the catalogue row, so
 * comparing one warehouse's shelf against it would report a product as low
 * whenever it is merely stored somewhere else — the prototype this replaced did
 * exactly that, once per warehouse, and inflated the list.
 */
const LIMIT = 5;

export function useLowStockAlert(enabled: boolean): UseLowStockAlertResult {
  const [items, setItems] = useState<LowStockProduct[]>([]);
  const [total, setTotal] = useState(0);
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
      .lowStock({ limit: LIMIT })
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setTotal(result.pagination.total);
      })
      .catch((err) => {
        if (!active) return;
        setItems([]);
        setTotal(0);
        setError(
          err instanceof ApiError
            ? err.message
            : "Daftar stok menipis gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [enabled]);

  return { items, total, loading, error };
}
