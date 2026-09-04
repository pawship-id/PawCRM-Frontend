"use client";

import { useEffect, useState } from "react";

import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-error";
import type { Product } from "@/types/inventory";

/** One screenful of candidates. Past this the answer is a search, not a page. */
const PAGE_LIMIT = 50;

/** Long enough that typing a SKU is one request, short enough to feel live. */
const DEBOUNCE_MS = 300;

export interface ProductCandidates {
  products: Product[];
  /** How many products match, which is usually more than `products` carries. */
  total: number;
  /** True when the match list was cut at PAGE_LIMIT — the picker says so. */
  truncated: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * The products a stock DOCUMENT may be built over — a count sheet, a transfer —
 * behind ProductMultiPicker.
 *
 * SEARCHED ON THE SERVER, NOT FILTERED IN THE BROWSER. A picker that loaded the
 * whole catalogue to filter it locally is fine at fifty products and a hang at
 * five thousand — and a tenant with five thousand is exactly the one who never
 * wants the whole warehouse on one sheet.
 *
 * `holdsStock=true` IS THE SERVER'S OWN LIST of the types stock may be posted
 * against. A `parent` is an abstraction over its variants and a `bundle`
 * consumes its components; the API refuses a line against either, so offering
 * them would be an invitation to a 400 after the user had chosen. Same flag, and
 * the same reasoning, as useStockCardLookups.
 *
 * ACTIVE PRODUCTS ONLY, unlike the stock card's lookup. That one feeds a READ,
 * where a deactivated product still owns its history; this one feeds a WRITE
 * somebody has to walk a shelf for, and a discontinued line is not on that
 * shelf. The whole-warehouse count the server builds applies the same rule.
 */
export function useProductCandidates(
  search: string,
  /** Narrows the list. "" is every category. */
  categoryId = "",
  /**
   * Only products with NO movement in this warehouse — the opening-stock
   * picker's rule, resolved by the server against the ledger.
   *
   * A WAREHOUSE ID RATHER THAN A FLAG, because "never moved" is only meaningful
   * somewhere: a product trading in one warehouse may legitimately be receiving
   * its opening balance in another, which is how a tenant that opens with two
   * locations fills both. "" leaves the list unfiltered, which is what every
   * other caller wants.
   */
  neverMovedInWarehouse = "",
  /**
   * Only products this warehouse HOLDS — the transfer picker's rule, resolved
   * by the server against the balances.
   *
   * The near-mirror of the filter above, and asked the same way and for the
   * same reason: a transfer draws goods off ONE shelf, so a product with
   * nothing on it can only ever produce a line the save refuses. "" leaves the
   * list unfiltered, which is what every other caller wants.
   */
  inStockAtWarehouse = "",
  /**
   * Only consignment goods (`true`) or only owned ones (`false`) — the receipt
   * picker's rule, resolved by the SERVER against `products.isConsignment`.
   *
   * A BOOLEAN WITH `undefined` AS THE UNFILTERED CASE, not `""` like the two
   * warehouse ids above. Those are ids, where empty is a natural "none given";
   * here `false` is a REAL filter meaning "not consignment", so it cannot share
   * a sentinel with "no filter" — a truthiness test would silently turn the
   * *Beli putus* picker back into the whole catalogue.
   *
   * Server-side for the reason the whole hook is: the list comes back capped at
   * PAGE_LIMIT, so filtering the returned page in the browser would drop
   * matches that never left the server and leave `total` counting rows the user
   * cannot see.
   */
  isConsignment: boolean | undefined = undefined,
): ProductCandidates {
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
          neverMovedInWarehouse: neverMovedInWarehouse || undefined,
          inStockAtWarehouse: inStockAtWarehouse || undefined,
          // Passed straight through: `false` is a filter, and `|| undefined`
          // here would drop exactly the case the receipt picker needs most.
          isConsignment,
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
  }, [
    search,
    categoryId,
    neverMovedInWarehouse,
    inStockAtWarehouse,
    isConsignment,
  ]);

  return {
    products,
    total,
    truncated: total > products.length,
    loading,
    error,
  };
}
