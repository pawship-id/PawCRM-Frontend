"use client";

import { useEffect, useState } from "react";

import { productService } from "@/services/product.service";
import { warehouseService } from "@/services/warehouse.service";
import { ApiError } from "@/services/api-error";
import type { Product, StockWarehouse } from "@/types/inventory";

const PAGE_LIMIT = 100;
/** At most 500 products. Beyond that the picker needs a search box, not a page. */
const MAX_PAGES = 5;

interface StockCardLookups {
  /** Every warehouse, INCLUDING inactive ones — see below. */
  warehouses: StockWarehouse[];
  /** `standalone` and `variant` only, sorted by name. */
  products: Product[];
  /** True when a tenant has more products than the picker loaded. */
  truncated: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * The two lists the stock card's picker needs.
 *
 * Mirrors useCatalogLookups — fetched in parallel, once on mount, no cache and
 * no refetch — but differs from it in what it asks for, and both differences are
 * deliberate:
 *
 *  1. INACTIVE WAREHOUSES ARE INCLUDED. useCatalogLookups filters them out
 *     because it feeds FORMS, and an inactive warehouse must not accept new
 *     movement. This feeds a READ: a deactivated warehouse still owns its stock
 *     and its whole history, and a stock card nobody can open is an audit hole.
 *  2. DELETED AND INACTIVE PRODUCTS ARE INCLUDED TOO, for the same reason. A
 *     product is deactivated rather than deleted precisely so its ledger rows
 *     keep resolving.
 *
 * `holdsStock=true` IS THE SERVER'S OWN LIST of the types a movement may be
 * posted against. This hook used to send two requests — `productType=standalone`
 * and `productType=variant` — and merge them, because `productType` takes one
 * value and `excludeVariants` filters out precisely the half needed. One flag
 * (PawCRM-Backend 0.20.0) replaced both the second request and the frontend's
 * copy of `STOCK_TRACKING_TYPES`, which would have gone stale the day a fifth
 * product type existed.
 *
 * A FAILURE HERE IS SHOWN, NOT SWALLOWED. `products:read` and `warehouses:read`
 * are separate permissions from `stockMovements:read`, so a role granted only
 * the last one gets pickers that cannot be filled — and "produk gagal dimuat" is
 * an answer its user can act on, where an empty dropdown is not.
 */
export function useStockCardLookups(): StockCardLookups {
  const [warehouses, setWarehouses] = useState<StockWarehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [warehouseResult, productResult] = await Promise.all([
          warehouseService.list({ limit: PAGE_LIMIT }),
          loadEveryPage(),
        ]);
        if (!active) return;

        setWarehouses(warehouseResult.items);
        setProducts(
          [...productResult.items].sort((a, b) =>
            a.name.localeCompare(b.name, "id-ID"),
          ),
        );
        setTruncated(productResult.truncated);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Daftar produk dan gudang gagal dimuat.",
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return { warehouses, products, truncated, loading, error };
}

/**
 * Every stock-holding product, up to MAX_PAGES pages.
 *
 * The first page reports `totalPages`, so the rest go out together rather than
 * one after another — a tenant with 300 variants would otherwise wait three
 * round trips deep to open a screen that has not asked a question yet.
 */
async function loadEveryPage(): Promise<{
  items: Product[];
  truncated: boolean;
}> {
  const first = await productService.list({
    holdsStock: true,
    limit: PAGE_LIMIT,
  });
  const { totalPages } = first.pagination;

  if (totalPages <= 1) return { items: first.items, truncated: false };

  const rest = await Promise.all(
    Array.from({ length: Math.min(totalPages, MAX_PAGES) - 1 }, (_, index) =>
      productService.list({
        holdsStock: true,
        limit: PAGE_LIMIT,
        page: index + 2,
      }),
    ),
  );

  return {
    items: [...first.items, ...rest.flatMap((page) => page.items)],
    truncated: totalPages > MAX_PAGES,
  };
}
