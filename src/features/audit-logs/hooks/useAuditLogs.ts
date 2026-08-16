"use client";

import { useCallback, useEffect, useState } from "react";

import { auditLogService } from "@/services/auditLog.service";
import { ApiError } from "@/services/api-error";
import type { AuditLog, AuditLogListQuery, PageResult } from "@/types/api";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/** The query knobs the audit-log screen drives (page + the visible filters). */
export interface AuditLogsQuery {
  page: number;
  search: string;
  /** "" means "all actions". */
  action: string;
}

const DEFAULT_QUERY: AuditLogsQuery = {
  page: 1,
  search: "",
  action: "",
};

/** Empty page so consumers can render a table shell before the first load. */
const EMPTY_PAGE: PageResult<AuditLog>["pagination"] = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

interface UseAuditLogsResult {
  logs: AuditLog[];
  pagination: PageResult<AuditLog>["pagination"];
  query: AuditLogsQuery;
  loading: boolean;
  error: string | null;
  /** Merge a partial query change; any change other than `page` resets to page 1. */
  setQuery: (patch: Partial<AuditLogsQuery>) => void;
  /** Re-run the current query. */
  refetch: () => void;
}

/**
 * Owns the audit-log query state and fetching for the trail screen.
 *
 * Follows the established component-drives-service pattern (see useRoles): local
 * state, a fetch effect keyed on the query, and a `refetch` for a manual reload.
 * The trail is READ-ONLY, so there are no row mutations to refetch after — but
 * the hook keeps `refetch` so the screen can offer a refresh. Any filter change
 * (search/action) resets to page 1 so the user is never stranded on an
 * out-of-range page.
 */
export function useAuditLogs(): UseAuditLogsResult {
  const [query, setQueryState] = useState<AuditLogsQuery>(DEFAULT_QUERY);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<AuditLog>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to force the effect to re-run without changing query.
  const [nonce, setNonce] = useState(0);

  // The toolbar keeps the live query so typing stays responsive; only the
  // request waits for the search box to settle.
  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<AuditLogsQuery>) => {
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

    const apiQuery: AuditLogListQuery = {
      page: settled.page,
      limit: 20,
      action: settled.action || undefined,
      search: settled.search.trim() || undefined,
    };

    auditLogService
      .list(apiQuery)
      .then((result) => {
        if (!active) return;
        setLogs(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setLogs([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load audit logs. Please try again.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settled, nonce]);

  return { logs, pagination, query, loading, error, setQuery, refetch };
}
