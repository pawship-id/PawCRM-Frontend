"use client";

import { useCallback, useEffect, useState } from "react";

import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-error";
import type { PageResult } from "@/types/api";
import type { Product, ProductListQuery, ProductSort } from "@/types/inventory";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/** The query knobs the stock-card index drives (page + the visible filters). */
export interface StockProductsQuery {
  page: number;
  search: string;
  /** "" = every category. */
  categoryId: string;
  /** "" = active and inactive both. */
  status: "" | "active" | "inactive";
  includeDeleted: boolean;
  sort: ProductSort;
}

const PAGE_SIZE = 20;

const DEFAULT_QUERY: StockProductsQuery = {
  page: 1,
  search: "",
  categoryId: "",
  status: "",
  includeDeleted: false,
  // The API's own default, restated rather than left out: the toolbar renders
  // the current value, and a select whose value is `undefined` shows nothing.
  sort: "nameAsc",
};

/** Empty page so the table shell renders before the first load returns. */
const EMPTY_PAGE: PageResult<Product>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

interface UseStockProductsResult {
  products: Product[];
  pagination: PageResult<Product>["pagination"];
  query: StockProductsQuery;
  loading: boolean;
  error: string | null;
  /** Merge a partial query change; anything but `page` resets to page 1. */
  setQuery: (patch: Partial<StockProductsQuery>) => void;
}

/**
 * The stock-card index's list: every product that can HOLD stock, searched and
 * paged by the server.
 *
 * Mirrors useProducts — same fetch-effect shape, same debounce, same page reset
 * — and differs from it in exactly one query decision, which is the whole reason
 * this exists as its own hook rather than a flag on that one.
 *
 * `holdsStock: true`, NEVER `excludeVariants`. The catalogue lists one row per
 * FAMILY and leaves variants to their parent, because twelve documents for one
 * product would make a page of twenty mostly one product. A stock card is
 * written per VARIANT — a parent holds no stock and has no ledger — so this
 * screen wants the rows the catalogue hides. `holdsStock` is the server's own
 * name for that set (`STOCK_TRACKING_TYPES`: standalone and variant), which also
 * keeps parents and bundles out without this file holding its own copy of the
 * type list. The three selectors `holdsStock` / `productType` / `excludeVariants`
 * are MUTUALLY EXCLUSIVE on the API — any pair is a 400 — so none of the others
 * may be added here later without removing this one.
 *
 * THERE IS NO `warehouseId` TO SEND. `GET /api/products` has no such filter, and
 * every row arrives carrying `stockByWarehouse` for every location it has stock
 * in. The screen's warehouse choice therefore picks which number each row shows,
 * not which rows exist — which is why no filter on this screen may be derived
 * from a quantity (see StockProductsToolbar).
 *
 * ORDERED BY NAME rather than by `newest`. The catalogue's default answers "what
 * did we just add"; this list is scanned for a product somebody already knows
 * the name of, and A–Z is where they will look for it.
 *
 * `enabled` IS NOT AN OPTIMISATION. `products:read` is a separate grant from the
 * `stockMovements:read` that puts this screen on the nav, and a permission check
 * cannot be a condition around a hook call. Without the flag a role holding only
 * the latter fires a request guaranteed to be refused on every page load — the
 * bug useFinanceDashboard already paid for once.
 */
export function useStockProducts(enabled: boolean): UseStockProductsResult {
  const [query, setQueryState] = useState<StockProductsQuery>(DEFAULT_QUERY);
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<Product>["pagination"]>(EMPTY_PAGE);
  // Starts idle when disabled, so a caller does not render a spinner for a
  // request that is never made — the shape useWarehouseOptions uses.
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  // The toolbar keeps the live query so typing stays responsive; only the
  // request waits for the search box to settle.
  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<StockProductsQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  useEffect(() => {
    // Nothing to synchronize, and nothing to unset: `loading` is reported as
    // false below whenever the hook is disabled, so this branch does not have to
    // write state from inside an effect to say so.
    if (!enabled) return;

    let active = true;
    // The sanctioned fetch-effect shape in this codebase (see useProducts):
    // show loading, synchronize, and guard the late setStates with `active`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const apiQuery: ProductListQuery = {
      page: settled.page,
      limit: PAGE_SIZE,
      search: settled.search.trim() || undefined,
      categoryId: settled.categoryId || undefined,
      includeDeleted: settled.includeDeleted || undefined,
      sort: settled.sort,
      holdsStock: true,
      ...(settled.status === ""
        ? {}
        : { isActive: settled.status === "active" }),
    };

    productService
      .list(apiQuery)
      .then((result) => {
        if (!active) return;
        setProducts(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setProducts([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Daftar produk gagal dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settled, enabled]);

  return {
    products,
    pagination,
    query,
    loading: enabled && loading,
    error,
    setQuery,
  };
}
