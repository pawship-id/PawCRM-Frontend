"use client";

import { useCallback, useEffect, useState } from "react";

import { categoryService } from "@/services/category.service";
import { ApiError } from "@/services/api-error";
import type { Category, CategoryListQuery, PageResult } from "@/types/api";

/** The query knobs the list screen drives (page + the visible filters). */
export interface CategoriesQuery {
  page: number;
  search: string;
  includeDeleted: boolean;
}

const PAGE_SIZE = 20;

const DEFAULT_QUERY: CategoriesQuery = {
  page: 1,
  search: "",
  includeDeleted: false,
};

/** Empty page so consumers can render a table shell before the first load. */
const EMPTY_PAGE: PageResult<Category>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

interface UseCategoriesResult {
  categories: Category[];
  pagination: PageResult<Category>["pagination"];
  query: CategoriesQuery;
  loading: boolean;
  error: string | null;
  /** Merge a partial query change; any change other than `page` resets to page 1. */
  setQuery: (patch: Partial<CategoriesQuery>) => void;
  /** Re-run the current query — call after a mutation (create, rename, delete). */
  refetch: () => void;
}

/**
 * Owns the category-list query state and fetching.
 *
 * Mirrors useBranches: local state, a fetch effect keyed on the query, and an
 * explicit `refetch` the mutations call. Any filter change resets to page 1 so
 * the user is never stranded on an out-of-range page after narrowing a search.
 *
 * There is no `kind` knob. The API discriminates product categories from a kind
 * that no longer exists in it, so filtering by it would be a control with one
 * setting — see CategoryKind.
 */
export function useCategories(): UseCategoriesResult {
  const [query, setQueryState] = useState<CategoriesQuery>(DEFAULT_QUERY);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<Category>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to force the effect to re-run without changing query.
  const [nonce, setNonce] = useState(0);

  const setQuery = useCallback((patch: Partial<CategoriesQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      // A filter change (anything but an explicit page move) returns to page 1.
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // The query changed (or refetch bumped the nonce): show the loading state,
    // then synchronize with the server. The stale-response guard (`active`)
    // makes the late setStates safe. Same sanctioned fetch-effect shape as
    // useBranches, so the heuristic lint rule is disabled here too.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const apiQuery: CategoryListQuery = {
      page: query.page,
      limit: PAGE_SIZE,
      search: query.search.trim() || undefined,
      includeDeleted: query.includeDeleted || undefined,
    };

    categoryService
      .list(apiQuery)
      .then((result) => {
        if (!active) return;
        setCategories(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setCategories([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Gagal memuat kategori. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query, nonce]);

  return {
    categories,
    pagination,
    query,
    loading,
    error,
    setQuery,
    refetch,
  };
}
