"use client";

import { useCallback, useEffect, useState } from "react";

import { roleService } from "@/services/role.service";
import { ApiError } from "@/services/api-error";
import type { Role, RoleListQuery, PageResult } from "@/types/api";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/** The query knobs the list screen drives (page + the visible filters). */
export interface RolesQuery {
  page: number;
  search: string;
  includeDeleted: boolean;
}

const DEFAULT_QUERY: RolesQuery = {
  page: 1,
  search: "",
  includeDeleted: false,
};

/** Empty page so consumers can render a table shell before the first load. */
const EMPTY_PAGE: PageResult<Role>["pagination"] = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

interface UseRolesResult {
  roles: Role[];
  pagination: PageResult<Role>["pagination"];
  query: RolesQuery;
  loading: boolean;
  error: string | null;
  /** Merge a partial query change; any change other than `page` resets to page 1. */
  setQuery: (patch: Partial<RolesQuery>) => void;
  /** Re-run the current query — call after a mutation (delete, restore). */
  refetch: () => void;
}

/**
 * Owns the role-list query state and fetching for the master/roles screen.
 *
 * Follows the established component-drives-service pattern (see useUsers): local
 * state, a fetch effect keyed on the query, and an explicit `refetch` the row
 * actions call after they mutate a role. Any filter change (search/deleted)
 * resets to page 1 so the user is never stranded on an out-of-range page. An
 * explicit `limit: 20` overrides the service's lookup-oriented default of 100.
 */
export function useRoles(): UseRolesResult {
  const [query, setQueryState] = useState<RolesQuery>(DEFAULT_QUERY);
  const [roles, setRoles] = useState<Role[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<Role>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to force the effect to re-run without changing query.
  const [nonce, setNonce] = useState(0);

  // The toolbar keeps the live query so typing stays responsive; only the
  // request waits for the search box to settle.
  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<RolesQuery>) => {
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
    // makes the late setStates safe — the sanctioned fetch-effect shape.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const apiQuery: RoleListQuery = {
      page: settled.page,
      limit: 20,
      search: settled.search.trim() || undefined,
      includeDeleted: settled.includeDeleted || undefined,
    };

    roleService
      .list(apiQuery)
      .then((result) => {
        if (!active) return;
        setRoles(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setRoles([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load roles. Please try again.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settled, nonce]);

  return { roles, pagination, query, loading, error, setQuery, refetch };
}
