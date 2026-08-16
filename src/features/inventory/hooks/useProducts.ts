"use client";

import { useCallback, useEffect, useState } from "react";

import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-error";
import type { PageResult } from "@/types/api";
import type {
  Product,
  ProductListQuery,
  ProductSort,
  ProductType,
} from "@/types/inventory";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/** The query knobs the catalogue screen drives (page + the visible filters). */
export interface ProductsQuery {
  page: number;
  search: string;
  /** "" = every top-level type, otherwise one specific type. */
  productType: ProductType | "";
  /** "" = every category. */
  categoryId: string;
  /** "" = active and inactive both. */
  status: "" | "active" | "inactive";
  includeDeleted: boolean;
  /** Which ordering to page through. */
  sort: ProductSort;
}

const PAGE_SIZE = 20;

const DEFAULT_QUERY: ProductsQuery = {
  page: 1,
  search: "",
  productType: "",
  categoryId: "",
  status: "",
  includeDeleted: false,
  // The API's own default, restated rather than left out: the toolbar renders
  // the current value, and a select whose value is `undefined` shows nothing.
  sort: "newest",
};

/** Empty page so the table shell renders before the first load returns. */
const EMPTY_PAGE: PageResult<Product>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

interface UseProductsResult {
  products: Product[];
  pagination: PageResult<Product>["pagination"];
  query: ProductsQuery;
  loading: boolean;
  error: string | null;
  /** Merge a partial query change; anything but `page` resets to page 1. */
  setQuery: (patch: Partial<ProductsQuery>) => void;
  /** Re-run the current query — call after a delete or a restore. */
  refetch: () => void;
}

/**
 * Owns the catalogue list's query state and fetching.
 *
 * Mirrors useCustomers: local state, a fetch effect keyed on the query, and an
 * explicit `refetch` the row actions call after they mutate. Any filter change
 * resets to page 1, so narrowing a search never strands the user on a page that
 * no longer exists.
 *
 * ONE ROW PER FAMILY, and that decision belongs here rather than in the table.
 * A tenant with six sizes × two flavours has twelve documents for one product;
 * listed flat, a page of twenty is one product and everything else is on page
 * three. `excludeVariants` filters them out IN THE QUERY, so `pagination.total`
 * counts the rows the screen actually shows — filtering them in the table would
 * leave a pager that promises pages of ghosts.
 *
 * `excludeVariants` and `productType` are mutually exclusive on the API (a 400
 * for the pair), which costs nothing here: picking a specific top-level type
 * already excludes variants, so exactly one of the two is ever sent.
 */
export function useProducts(): UseProductsResult {
  const [query, setQueryState] = useState<ProductsQuery>(DEFAULT_QUERY);
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<Product>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to re-run the effect without changing the query.
  const [nonce, setNonce] = useState(0);

  // The toolbar keeps the live query so typing stays responsive; only the
  // request waits for the search box to settle.
  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<ProductsQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // The sanctioned fetch-effect shape in this codebase (see useCustomers):
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
      ...(settled.productType === ""
        ? { excludeVariants: true }
        : { productType: settled.productType }),
      ...(settled.status === "" ? {} : { isActive: settled.status === "active" }),
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
            : "Katalog gagal dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settled, nonce]);

  return { products, pagination, query, loading, error, setQuery, refetch };
}
