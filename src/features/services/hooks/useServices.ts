"use client";

import { useCallback, useEffect, useState } from "react";

import { serviceService } from "@/services/service.service";
import { ApiError } from "@/services/api-error";
import type { Service, ServiceListQuery, PageResult } from "@/types/api";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/** The query knobs the list screen drives (page + the visible filters). */
export interface ServicesQuery {
  page: number;
  search: string;
  /** "" = any line, otherwise one businessLineId. */
  businessLineId: string;
  /** "" = both, "true"/"false" = only offered / only retired. */
  isActive: "" | "true" | "false";
  includeDeleted: boolean;
}

const PAGE_SIZE = 20;

const DEFAULT_QUERY: ServicesQuery = {
  page: 1,
  search: "",
  businessLineId: "",
  isActive: "",
  includeDeleted: false,
};

/** Empty page so consumers can render a table shell before the first load. */
const EMPTY_PAGE: PageResult<Service>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

interface UseServicesResult {
  services: Service[];
  pagination: PageResult<Service>["pagination"];
  query: ServicesQuery;
  loading: boolean;
  error: string | null;
  /** Merge a partial query change; any change other than `page` resets to page 1. */
  setQuery: (patch: Partial<ServicesQuery>) => void;
  /** Re-run the current query — call after a mutation (delete, restore). */
  refetch: () => void;
}

/**
 * Owns the service-list query state and fetching.
 *
 * Mirrors usePets: local state, a fetch effect keyed on the query, and an
 * explicit `refetch` the row actions call after they mutate a service.
 *
 * NO SORT KNOB, deliberately. The server returns the catalogue alphabetically
 * and every caller wants it that way — a service list is read as a menu. Adding
 * a control for it would offer a choice nobody at a till is making.
 */
export function useServices(): UseServicesResult {
  const [query, setQueryState] = useState<ServicesQuery>(DEFAULT_QUERY);
  const [services, setServices] = useState<Service[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<Service>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to force the effect to re-run without changing query.
  const [nonce, setNonce] = useState(0);

  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<ServicesQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // The sanctioned fetch-effect shape — see useCustomers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const apiQuery: ServiceListQuery = {
      page: settled.page,
      limit: PAGE_SIZE,
      search: settled.search.trim() || undefined,
      businessLineId: settled.businessLineId || undefined,
      // "" means "both", so the key is omitted entirely rather than sent as a
      // boolean — `isActive=false` is a real filter and must not be confused
      // with "no opinion".
      isActive:
        settled.isActive === "" ? undefined : settled.isActive === "true",
      includeDeleted: settled.includeDeleted || undefined,
    };

    serviceService
      .list(apiQuery)
      .then((result) => {
        if (!active) return;
        setServices(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setServices([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Daftar layanan tidak bisa dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settled, nonce]);

  return { services, pagination, query, loading, error, setQuery, refetch };
}
