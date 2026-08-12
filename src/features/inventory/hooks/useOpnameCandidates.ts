"use client";

import { useEffect, useState } from "react";

import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-error";
import type { Product } from "@/types/inventory";

/** One screenful of candidates. Past this the answer is a search, not a page. */
const PAGE_LIMIT = 50;

/** Long enough that typing a SKU is one request, short enough to feel live. */
const DEBOUNCE_MS = 300;

export interface OpnameCandidates {
  products: Product[];
  /** How many products match, which is usually more than `products` carries. */
  total: number;
  /** True when the match list was cut at PAGE_LIMIT — the picker says so. */
  truncated: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * The products a count sheet may be opened over, for the start card's picker.
 *
 * SEARCHED ON THE SERVER, NOT FILTERED IN THE BROWSER. A picker that loaded the
 * whole catalogue to filter it locally is fine at fifty products and a hang at
 * five thousand — and a tenant with five thousand is exactly the one who never
 * wants the whole warehouse on one sheet.
 *
 * `holdsStock=true` IS THE SERVER'S OWN LIST of the types stock may be posted
 * against. A `parent` is an abstraction over its variants and a `bundle`
 * consumes its components; the API refuses a count line against either, so
 * offering them would be an invitation to a 400 after the user had chosen. Same
 * flag, and the same reasoning, as useStockCardLookups.
 *
 * ACTIVE PRODUCTS ONLY, unlike the stock card's lookup. That one feeds a READ,
 * where a deactivated product still owns its history; this one opens a sheet
 * somebody has to walk a shelf for, and a discontinued line is not on that
 * shelf. The whole-warehouse count the server builds applies the same rule.
 */
export function useOpnameCandidates(
  search: string,
  categoryId: string,
): OpnameCandidates {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    // Debounced like useMovementPreview: the effect re-runs on every keystroke,
    // and only the last one in a burst reaches the API.
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);

      productService
        .list({
          holdsStock: true,
          isActive: true,
          search: search.trim() || undefined,
          categoryId: categoryId || undefined,
          limit: PAGE_LIMIT,
        })
        .then((result) => {
          if (!active) return;
          setProducts(result.items);
          setTotal(result.pagination.total);
        })
        .catch((err) => {
          if (!active) return;
          setProducts([]);
          setTotal(0);
          setError(
            err instanceof ApiError
              ? err.message
              : "Daftar produk gagal dimuat.",
          );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, categoryId]);

  return {
    products,
    total,
    truncated: total > products.length,
    loading,
    error,
  };
}
