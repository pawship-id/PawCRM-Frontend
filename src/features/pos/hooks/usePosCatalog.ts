"use client";

import { useCallback, useEffect, useState } from "react";

import { posService } from "@/services/pos.service";
import { ApiError } from "@/services/api-error";
import type {
  PageResult,
  PosCatalogItem,
  PosCatalogQuery,
  PosItemKind,
} from "@/types/api";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/** The knobs the grid drives. `kind` is the pill row's one dimension. */
export interface PosCatalogState {
  page: number;
  search: string;
  /** "" = Semua, otherwise one category id, or the literal "service" pill. */
  categoryId: string;
  /** "" = both kinds. The Layanan pill sets "service". */
  kind: PosItemKind | "";
}

const DEFAULT_STATE: PosCatalogState = {
  page: 1,
  search: "",
  categoryId: "",
  kind: "",
};

const EMPTY_PAGE: PageResult<PosCatalogItem>["pagination"] = {
  page: 1,
  limit: 8,
  total: 0,
  totalPages: 0,
};

interface UsePosCatalogResult {
  items: PosCatalogItem[];
  pagination: PageResult<PosCatalogItem>["pagination"];
  state: PosCatalogState;
  /** The term the items on screen were fetched with — what to highlight. */
  matchedSearch: string;
  loading: boolean;
  error: string | null;
  /** Merge a change; anything but `page` returns to page 1. */
  setState: (patch: Partial<PosCatalogState>) => void;
}

/**
 * The till grid (FR-1).
 *
 * PAGE RESETS ON EVERY OTHER CHANGE, which FR-1 states outright ("ganti kategori
 * atau ubah kata kunci mereset ke halaman 1") and which matters more here than
 * on an ordinary list: a cashier who types while on page 3 would otherwise be
 * looking at an empty grid and conclude the shop does not stock it.
 *
 * THE WAREHOUSE IS NOT A PARAMETER. The server reads it from the shift, so the
 * badge always answers "can I sell this from THIS till".
 */
export function usePosCatalog(): UsePosCatalogResult {
  const [state, setLocalState] = useState<PosCatalogState>(DEFAULT_STATE);
  const [items, setItems] = useState<PosCatalogItem[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<PosCatalogItem>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const settled = useDebouncedQuery(state);

  const setState = useCallback((patch: Partial<PosCatalogState>) => {
    setLocalState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const query: PosCatalogQuery = {
      page: settled.page,
      search: settled.search.trim() || undefined,
      categoryId: settled.categoryId || undefined,
      kinds: settled.kind === "" ? undefined : [settled.kind],
    };

    posService
      .catalog(query)
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setItems([]);
        setError(
          err instanceof ApiError
            ? "Katalog tidak bisa dimuat. Coba lagi."
            : "Katalog tidak bisa dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settled]);

  return {
    items,
    pagination,
    state,
    /*
      THE TERM THE ITEMS ON SCREEN WERE ACTUALLY FETCHED WITH — the settled one,
      not what is being typed right now.

      The difference matters for the highlight. `state.search` runs ahead of the
      results by the length of the debounce, so highlighting with it would mark
      up the PREVIOUS page of results against a term they were never matched on:
      a cashier typing "royal" would watch highlights blink off and land
      somewhere else a moment later.
    */
    matchedSearch: settled.search.trim(),
    loading,
    error,
    setState,
  };
}
