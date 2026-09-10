"use client";

import { useEffect, useState } from "react";

import { categoryService } from "@/services/category.service";
import { productService } from "@/services/product.service";

/** One tile's number: how many there are, and whether we know yet. */
export interface CatalogCount {
  total: number;
  loading: boolean;
  error: boolean;
}

export interface CatalogCounts {
  /** Catalogue rows — standalone products, variant families, bundles. */
  products: CatalogCount;
  /** The concrete sellable items under those families. See below. */
  variants: CatalogCount;
  categories: CatalogCount;
}

const PENDING: CatalogCount = { total: 0, loading: true, error: false };
const FAILED: CatalogCount = { total: 0, loading: false, error: true };
/** Not asked for — the caller holds no grant, so its tile is never rendered. */
const UNGRANTED: CatalogCount = { total: 0, loading: false, error: false };

/**
 * The three headline numbers on the Produk & Varian screen.
 *
 * ONE ROW IS FETCHED PER COUNT, NOT THE LIST. `limit: 1` costs a small query and
 * `pagination.total` still reports the true figure — the trick useLowStockAlert
 * and useRegistryCounts both play.
 *
 * VARIANTS ARE A SUBTRACTION, and that is the only honest way to get them today.
 * `excludeVariants: true` is the CATALOGUE view — one row per family — while the
 * unfiltered list counts every row there is, variants included. The difference
 * is exactly how many concrete items those families spread into. Counting them
 * any other way would mean paging the whole catalogue and adding up `variants[]`
 * client-side, which is a report, not a tile.
 *
 * NOT TAKEN FROM THE LIST ALREADY ON SCREEN: that list is filtered, and a tile
 * that fell to 3 as somebody typed in the search box would not be counting what
 * it says it counts.
 *
 * Each side is gated by its own grant — a role that may read products but not
 * categories gets two tiles rather than a 403 painted across the header.
 */
export function useCatalogCounts(
  mayReadProducts: boolean,
  mayReadCategories: boolean,
): CatalogCounts {
  const [products, setProducts] = useState<CatalogCount>(PENDING);
  const [variants, setVariants] = useState<CatalogCount>(PENDING);
  const [categories, setCategories] = useState<CatalogCount>(PENDING);

  useEffect(() => {
    let active = true;

    // The sanctioned fetch-effect shape (see useLowStockAlert): every tile goes
    // back to pending before the requests that refill it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProducts(mayReadProducts ? PENDING : UNGRANTED);
    setVariants(mayReadProducts ? PENDING : UNGRANTED);
    setCategories(mayReadCategories ? PENDING : UNGRANTED);

    if (mayReadProducts) {
      Promise.all([
        productService.list({ page: 1, limit: 1, excludeVariants: true }),
        productService.list({ page: 1, limit: 1 }),
      ])
        .then(([families, everything]) => {
          if (!active) return;
          const catalogue = families.pagination.total;
          setProducts({ total: catalogue, loading: false, error: false });
          setVariants({
            // Never below zero, however the two totals disagree: a negative
            // count is a number nobody can act on.
            total: Math.max(everything.pagination.total - catalogue, 0),
            loading: false,
            error: false,
          });
        })
        .catch(() => {
          if (!active) return;
          setProducts(FAILED);
          setVariants(FAILED);
        });
    }

    if (mayReadCategories) {
      categoryService
        .list({ page: 1, limit: 1 })
        .then((result) => {
          if (active)
            setCategories({
              total: result.pagination.total,
              loading: false,
              error: false,
            });
        })
        .catch(() => {
          if (active) setCategories(FAILED);
        });
    }

    return () => {
      active = false;
    };
  }, [mayReadProducts, mayReadCategories]);

  return { products, variants, categories };
}
