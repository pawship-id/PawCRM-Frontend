"use client";

import { useCallback, useEffect, useState } from "react";

import { categoryService } from "@/services/category.service";
import { ApiError } from "@/services/api-error";
import { SUB_LEVEL_ONLY, TOP_LEVEL_ONLY } from "@/types/api";
import type {
  Category,
  CategoryListQuery,
  CategorySort,
  PageResult,
} from "@/types/api";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/** The query knobs the list screen drives (page + the visible filters). */
export interface CategoriesQuery {
  page: number;
  search: string;
  /** "" = retired and live both. */
  status: "" | "active" | "inactive";
  /**
   * Which level of the tree. "" = both, which is what the screen opens on —
   * a tenant managing its label set wants to see all of them.
   */
  level: "" | "top" | "sub";
  includeDeleted: boolean;
  /** Which ordering to page through. */
  sort: CategorySort;
}

const PAGE_SIZE = 20;

/**
 * OPENS ON EVERY CATEGORY, retired ones included. This screen exists to manage
 * the label set, and the retired labels are the half of it most likely to need
 * attention — defaulting to Aktif would hide them from the only screen that can
 * bring them back. Deleted rows still stay out until asked for: those are gone,
 * not merely retired.
 */
const DEFAULT_QUERY: CategoriesQuery = {
  page: 1,
  search: "",
  status: "",
  level: "",
  includeDeleted: false,
  // The API's own default, restated rather than left out: the panel renders the
  // current value, and a select whose value is `undefined` shows nothing.
  sort: "newest",
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

  // The toolbar keeps the live query so typing stays responsive; only the
  // request waits for the search box to settle.
  const settled = useDebouncedQuery(query);

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
      page: settled.page,
      limit: PAGE_SIZE,
      search: settled.search.trim() || undefined,
      // Sent only when narrowed: the API applies no default, so omitting it is
      // how "both" is asked for.
      ...(settled.status === ""
        ? {}
        : { isActive: settled.status === "active" }),
      /**
       * ONE PARAMETER, FOUR STATES — an id, `none`, `sub`, or absent for both
       * levels. Narrowed on the SERVER rather than by filtering the fetched
       * page: a client-side filter would leave `pagination.total` counting rows
       * that are no longer on screen, and a "6 dari 20" that cannot be
       * reconciled is worse than no count.
       */
      ...(settled.level === "top" ? { parentId: TOP_LEVEL_ONLY } : {}),
      ...(settled.level === "sub" ? { parentId: SUB_LEVEL_ONLY } : {}),
      includeDeleted: settled.includeDeleted || undefined,
      sort: settled.sort,
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
  }, [settled, nonce]);

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
