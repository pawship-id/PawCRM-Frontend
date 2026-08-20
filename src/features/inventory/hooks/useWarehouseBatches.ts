"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { productBatchService } from "@/services/productBatch.service";
import type { ProductBatch } from "@/types/inventory";

/** One shared empty map — a fresh one per render would break memo equality. */
const EMPTY: Map<string, ProductBatch[]> = new Map();

interface UseWarehouseBatchesResult {
  /** productId → the lots at this warehouse that still hold something. */
  byProduct: Map<string, ProductBatch[]>;
  loading: boolean;
  error: string | null;
}

/**
 * Every lot with stock left at one warehouse, grouped by product.
 *
 * ONE REQUEST FOR THE WHOLE SHEET, not one per line. A document may name twenty
 * lot-tracked products, and a hook per row is not a thing React allows anyway —
 * but the deeper reason is that twenty requests to answer one question is how a
 * form that felt fine with two lines becomes unusable with twenty.
 *
 * `hasRemaining` ONLY. An adjustment against a lot that is already empty can
 * only ever be an increase, and an increase into a spent lot is not what the
 * option means — the answer there is a new batch, which the picker offers
 * separately.
 *
 * Re-read when the warehouse changes, because a lot belongs to a location: the
 * same product's lots at another warehouse are different boxes.
 */
export function useWarehouseBatches(
  warehouseId: string,
): UseWarehouseBatchesResult {
  const [byProduct, setByProduct] = useState<Map<string, ProductBatch[]>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No warehouse, no question to ask. Returning early rather than clearing
    // state: the empty answer is DERIVED below, so the effect never has to write
    // one — a setState in an effect body is a render the component did not need.
    if (warehouseId === "") return;

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    productBatchService
      .list({ warehouseId, hasRemaining: true, limit: 100 })
      .then((result) => {
        if (!active) return;
        const grouped = new Map<string, ProductBatch[]>();
        for (const lot of result.items) {
          const key = String(lot.productId);
          const list = grouped.get(key);
          if (list) list.push(lot);
          else grouped.set(key, [lot]);
        }
        setByProduct(grouped);
      })
      .catch((err) => {
        if (!active) return;
        setByProduct(new Map());
        setError(
          err instanceof ApiError ? err.message : "Daftar batch gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [warehouseId]);

  return {
    // Derived rather than stored: with no warehouse there are no lots, and a
    // stale map from the previously chosen one must not be readable while the
    // picker is empty.
    byProduct: warehouseId === "" ? EMPTY : byProduct,
    loading,
    error,
  };
}
