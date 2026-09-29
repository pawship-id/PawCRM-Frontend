"use client";

import { useEffect, useState } from "react";

import { productService } from "@/services/product.service";
import { serviceService } from "@/services/service.service";

/** The two halves of the catalogue, and whether either is known yet. */
export interface SkuCounts {
  goods: number | null;
  services: number | null;
  loading: boolean;
  error: boolean;
}

/**
 * HOW MANY SELLABLE THINGS THE TENANT HAS — the Ringkasan tab's second card,
 * split the way the mockup splits it: barang and jasa.
 *
 * TWO COLLECTIONS, TWO GRANTS. Goods live in `products` and services in
 * `services`, and a role may hold one grant without the other — so each half is
 * asked for only where it may be read, and a missing half stays null rather than
 * being counted as zero. "248 SKU" that silently left out a shop's entire
 * grooming menu is worse than "214 barang" beside nothing.
 *
 * ONE ROW IS FETCHED PER COUNT, NOT THE LIST: `limit: 1` costs a small query and
 * `pagination.total` still reports the true figure — the trick every count in
 * this module plays.
 *
 * VARIANTS ARE COUNTED, not the families. A shop asking how many SKUs it keeps
 * means the concrete sellable items — "Royal Canin 2kg" and "…3kg" are two
 * things on two shelves, and a catalogue view that counted the family as one
 * would undercount exactly the products with the most stock.
 */
export function useSkuCounts(
  mayReadProducts: boolean,
  mayReadServices: boolean,
): SkuCounts {
  const [goods, setGoods] = useState<number | null>(null);
  const [services, setServices] = useState<number | null>(null);
  const [loading, setLoading] = useState(mayReadProducts || mayReadServices);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!mayReadProducts && !mayReadServices) return;

    let active = true;

    Promise.allSettled([
      mayReadProducts ? productService.list({ page: 1, limit: 1 }) : null,
      mayReadServices ? serviceService.list({ page: 1, limit: 1 }) : null,
    ]).then(([goodsResult, servicesResult]) => {
      if (!active) return;

      // Settled independently: a service catalogue that failed to answer must
      // not blank the goods count beside it.
      if (goodsResult.status === "fulfilled" && goodsResult.value) {
        setGoods(goodsResult.value.pagination.total);
      }
      if (servicesResult.status === "fulfilled" && servicesResult.value) {
        setServices(servicesResult.value.pagination.total);
      }
      setError(
        (mayReadProducts && goodsResult.status === "rejected") ||
          (mayReadServices && servicesResult.status === "rejected"),
      );
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [mayReadProducts, mayReadServices]);

  return { goods, services, loading, error };
}
