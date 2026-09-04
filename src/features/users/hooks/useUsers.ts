"use client";

import { useCallback, useEffect, useState } from "react";

import { userService } from "@/services/user.service";
import { ApiError } from "@/services/api-error";
import type { User, UserListQuery, PageResult } from "@/types/api";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/** The query knobs the list screen drives (page + the visible filters). */
export interface UsersQuery {
  page: number;
  search: string;
  status: User["status"] | "";
  includeDeleted: boolean;
}

const DEFAULT_QUERY: UsersQuery = {
  page: 1,
  search: "",
  status: "",
  includeDeleted: false,
};

/** Empty page so consumers can render a table shell before the first load. */
const EMPTY_PAGE: PageResult<User>["pagination"] = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

interface UseUsersResult {
  users: User[];
  pagination: PageResult<User>["pagination"];
  query: UsersQuery;
  loading: boolean;
  error: string | null;
  /** Merge a partial query change; any change other than `page` resets to page 1. */
  setQuery: (patch: Partial<UsersQuery>) => void;
  /** Re-run the current query — call after a mutation (delete, status change). */
  refetch: () => void;
}

/**
 * Owns the user-list query state and fetching for the master/users screen.
 *
 * There is no shared cache or data-fetching library in the app yet, so this
 * follows the established component-drives-service pattern: local state, a
 * fetch effect keyed on the query, and an explicit `refetch` the row actions
 * call after they mutate a user. Any filter change (search/status/deleted)
 * resets to page 1 so the user is never stranded on an out-of-range page.
 */
export function useUsers(): UseUsersResult {
  const [query, setQueryState] = useState<UsersQuery>(DEFAULT_QUERY);
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<User>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to force the effect to re-run without changing query.
  const [nonce, setNonce] = useState(0);

  // The toolbar keeps the live query so typing stays responsive; only the
  // request waits for the search box to settle.
  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<UsersQuery>) => {
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
    // then synchronize with the server. The fetch below is the external system
    // this effect syncs with; the stale-response guard (`active`) makes the
    // late setStates safe. This is the codebase's sanctioned fetch-effect shape
    // (see AuthProvider), so the heuristic lint rule is disabled here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const apiQuery: UserListQuery = {
      page: settled.page,
      search: settled.search.trim() || undefined,
      status: settled.status || undefined,
      includeDeleted: settled.includeDeleted || undefined,
    };

    userService
      .list(apiQuery)
      .then((result) => {
        if (!active) return;
        setUsers(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setUsers([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load users. Please try again.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settled, nonce]);

  return { users, pagination, query, loading, error, setQuery, refetch };
}
