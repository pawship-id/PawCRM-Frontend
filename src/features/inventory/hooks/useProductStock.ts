"use client";

import { useEffect, useState } from "react";

import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-error";
import type { Product } from "@/types/inventory";

import { qtyAtWarehouse } from "../utils/ledger";

interface UseProductStockResult {
  /** The full product — `unit`, `hppAvg`, `minStock`, `hasExpiry`. */
  product: Product | null;
  /** Decimal string. The quantity THIS warehouse holds right now. */
  qtyOnHand: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * One product's current position at one warehouse.
 *
 * Two jobs, and the second is the important one:
 *
 *  1. The stat tiles need `unit`, `hppAvg` and `minStock`, none of which a
 *     ledger row carries.
 *  2. `qtyOnHand` IS THE ANCHOR the running balance is derived from — see
 *     utils/ledger.ts. Everything the ledger table shows in its balance column
 *     is this number, walked backwards.
 *
 * FETCHED FRESH RATHER THAN READ OFF THE PICKER'S LIST. The lookup hook already
 * loads products carrying `stockByWarehouse`, so this is a second request for
 * data the screen technically has. It is worth it: that list is loaded once on
 * mount and never again, and an anchor that has drifted since the page opened
 * produces a stock card where every balance is wrong by the same amount —
 * plausible, uniform and very hard to notice. Sharing `refreshKey` with
 * useStockCard means the anchor and the rows are always re-read together.
 *
 * There is still a window between the two requests in which a movement can be
 * posted. The consequence is bounded — one refresh corrects it — and closing it
 * properly needs a server-computed balance (PawCRM-Backend
 * docs/stock-card-gaps.md, gap 1).
 */
export function useProductStock(
  productId: string,
  warehouseId: string,
  refreshKey: number,
): UseProductStockResult {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) {
      return;
    }

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    productService
      .getById(productId)
      .then((result) => {
        if (!active) return;
        setProduct(result);
      })
      .catch((err) => {
        if (!active) return;
        setProduct(null);
        setError(
          err instanceof ApiError
            ? err.message
            : "Data stok produk gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [productId, refreshKey]);

  return {
    product,
    qtyOnHand:
      product && warehouseId
        ? qtyAtWarehouse(product.stockByWarehouse, warehouseId)
        : null,
    loading,
    error,
  };
}
