"use client";

import { useCallback, useEffect, useState } from "react";

import { petService } from "@/services/pet.service";
import { ApiError } from "@/services/api-error";
import type { Pet, PetListQuery, PageResult, PetSpecies } from "@/types/api";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/** The query knobs the list screen drives (page + the visible filters). */
export interface PetsQuery {
  page: number;
  search: string;
  /** "" = any species, otherwise one catalogued species. */
  species: PetSpecies | "";
  /** "" = both, "true"/"false" = only pets in care / only retired ones. */
  isActive: "" | "true" | "false";
  includeDeleted: boolean;
  /** Fixed by the caller when the list is scoped to one owner; never a visible filter. */
  customerId?: string;
}

const PAGE_SIZE = 20;

const DEFAULT_QUERY: PetsQuery = {
  page: 1,
  search: "",
  species: "",
  isActive: "",
  includeDeleted: false,
};

/** Empty page so consumers can render a table shell before the first load. */
const EMPTY_PAGE: PageResult<Pet>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

interface UsePetsResult {
  pets: Pet[];
  pagination: PageResult<Pet>["pagination"];
  query: PetsQuery;
  loading: boolean;
  error: string | null;
  /** Merge a partial query change; any change other than `page` resets to page 1. */
  setQuery: (patch: Partial<PetsQuery>) => void;
  /** Re-run the current query — call after a mutation (delete, restore). */
  refetch: () => void;
}

/**
 * Owns the pet-list query state and fetching.
 *
 * Mirrors useCustomers: local state, a fetch effect keyed on the query, and an
 * explicit `refetch` the row actions call after they mutate a pet. Any filter
 * change resets to page 1 so the user is never stranded on an out-of-range page.
 *
 * `customerId` IS AN ARGUMENT, NOT A FILTER, and that is the one place this
 * departs from useCustomers. The same hook drives two screens: the full register
 * under Master Data, and the pet list inside one customer. On the second, the
 * owner is not something the user may change — it is the context — so it is
 * seeded here rather than rendered as a control somebody could clear and end up
 * looking at every animal in the shop.
 */
export function usePets(customerId?: string): UsePetsResult {
  const [query, setQueryState] = useState<PetsQuery>({
    ...DEFAULT_QUERY,
    customerId,
  });
  const [pets, setPets] = useState<Pet[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<Pet>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to force the effect to re-run without changing query.
  const [nonce, setNonce] = useState(0);

  // The toolbar keeps the live query so typing stays responsive; only the
  // request waits for the search box to settle.
  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<PetsQuery>) => {
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
    // makes the late setStates safe. This mirrors the sanctioned fetch-effect
    // shape in useCustomers, so the heuristic lint rule is disabled here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const apiQuery: PetListQuery = {
      page: settled.page,
      limit: PAGE_SIZE,
      customerId: settled.customerId,
      search: settled.search.trim() || undefined,
      species: settled.species === "" ? undefined : settled.species,
      // "" means "both", so the key is omitted entirely rather than sent as a
      // boolean — `isActive=false` is a real filter and must not be confused
      // with "no opinion".
      isActive: settled.isActive === "" ? undefined : settled.isActive === "true",
      includeDeleted: settled.includeDeleted || undefined,
    };

    petService
      .list(apiQuery)
      .then((result) => {
        if (!active) return;
        setPets(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setPets([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Daftar hewan tidak bisa dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settled, nonce]);

  return { pets, pagination, query, loading, error, setQuery, refetch };
}
