"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/services/api-error";
import { productBatchService } from "@/services/productBatch.service";
import type { ProductBatch } from "@/types/inventory";

import { chunked, useRefreshOnReturn } from "./useLiveStock";

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
 *
 * `liveProductIds` — THE LINES THE FORM CARRIES, kept current while it is open.
 * The whole shelf is read once; after that only these products' lots are asked
 * again, in one request: when a product joins the form (its lots may have
 * moved since the shelf was read) and when somebody comes back to the tab. A
 * form that leaves it out — the opname, a receipt — reads the shelf once, as
 * before.
 */
export function useWarehouseBatches(
  warehouseId: string,
  liveProductIds: string[] = [],
): UseWarehouseBatchesResult {
  const [byProduct, setByProduct] = useState<Map<string, ProductBatch[]>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveKey = [...new Set(liveProductIds.filter(Boolean))].sort().join(",");
  const live = useRef<string[]>([]);
  /** Products whose lots are current — read with the shelf, or since. */
  const asked = useRef(new Set<string>());
  /** The warehouse a late answer must still match to be kept. */
  const shelf = useRef(warehouseId);

  useEffect(() => {
    live.current = liveKey ? liveKey.split(",") : [];
  }, [liveKey]);

  /** Re-reads the lots of `ids` at the current shelf and replaces theirs. */
  const refresh = useCallback(
    (ids: string[]) => {
      if (warehouseId === "" || ids.length === 0) return;

      Promise.all(
        chunked(ids).map(async (chunk) => {
          const lots: ProductBatch[] = [];
          let page = 1;
          let totalPages = 1;
          do {
            const result = await productBatchService.list({
              warehouseId,
              productIds: chunk,
              hasRemaining: true,
              limit: 100,
              page,
            });
            lots.push(...result.items);
            totalPages = result.pagination.totalPages;
            page += 1;
          } while (page <= totalPages);
          return lots;
        }),
      )
        .then((results) => {
          if (shelf.current !== warehouseId) return;
          setByProduct((before) => {
            const next = new Map(before);
            // Cleared first: a product whose last lot emptied has no row in
            // the answer, and must not keep the lots it had.
            ids.forEach((id) => next.delete(id));
            for (const lot of results.flat()) {
              const key = String(lot.productId);
              next.set(key, [...(next.get(key) ?? []), lot]);
            }
            return next;
          });
        })
        // Silent: the shelf read above still stands, and the save re-checks.
        .catch(() => {});
    },
    [warehouseId],
  );

  useEffect(() => {
    shelf.current = warehouseId;
    // Whatever is on the form now arrives with the shelf read below.
    asked.current = new Set(live.current);

    // No warehouse, no question to ask. Returning early rather than clearing
    // state: the empty answer is DERIVED below, so the effect never has to write
    // one — a setState in an effect body is a render the component did not need.
    if (warehouseId === "") return;

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    // EVERY PAGE, not the first. The API caps a page at 100 and orders by expiry,
    // so a warehouse holding more lots than that silently dropped the later ones
    // — and a product whose lots fell off page one read as "Belum ada batch",
    // moving goods unbatched that do carry a lot.
    (async () => {
      const lots: ProductBatch[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const result = await productBatchService.list({
          warehouseId,
          hasRemaining: true,
          limit: 100,
          page,
        });
        lots.push(...result.items);
        totalPages = result.pagination.totalPages;
        page += 1;
      } while (page <= totalPages && active);
      return lots;
    })()
      .then((items) => {
        if (!active) return;
        const grouped = new Map<string, ProductBatch[]>();
        for (const lot of items) {
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

  /*
    AFTER the shelf read above, deliberately: on the render a warehouse is
    chosen, that effect has just marked every line as covered by the read, so
    this one finds nothing to ask. Products added later are asked here.
  */
  useEffect(() => {
    if (loading) return;
    const missing = live.current.filter((id) => !asked.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => asked.current.add(id));
    refresh(missing);
  }, [liveKey, loading, refresh]);

  useRefreshOnReturn(() => refresh(live.current));

  return {
    // Derived rather than stored: with no warehouse there are no lots, and a
    // stale map from the previously chosen one must not be readable while the
    // picker is empty.
    byProduct: warehouseId === "" ? EMPTY : byProduct,
    loading,
    error,
  };
}
