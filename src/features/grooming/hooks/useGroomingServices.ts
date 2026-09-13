"use client";

import { useCallback, useEffect, useState } from "react";

import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";
import { serviceService } from "@/services/service.service";
import type { PageResult, Service } from "@/types/api";

export interface GroomingServicesQuery {
  page: number;
  search: string;
  /** "" = both. */
  isActive: "" | "true" | "false";
  /** Deleted services too — the only way to reach one to Pulihkan it. */
  includeDeleted: boolean;
}

const PAGE_SIZE = 20;

const DEFAULT_QUERY: GroomingServicesQuery = {
  page: 1,
  search: "",
  isActive: "",
  includeDeleted: false,
};

const EMPTY_PAGE: PageResult<Service>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

interface Loaded {
  key: string;
  services: Service[];
  pagination: PageResult<Service>["pagination"];
  failed: boolean;
}

/**
 * The Layanan & Harga tab's list — `GET /services` pinned to the Grooming line.
 *
 * MIRRORS the catalogue-wide `useServices` it outlived, minus the line filter
 * (the tab IS the filter). The deleted toggle and `refetch` came across when that
 * list was removed on 13 September 2026: this tab is where a service is deleted
 * and restored now, and a row action has to be able to re-read the page.
 */
export function useGroomingServices(lineId: string | null) {
  const [query, setQueryState] = useState<GroomingServicesQuery>(DEFAULT_QUERY);
  const settled = useDebouncedQuery(query);
  // Bumped by refetch() so the effect re-runs without the query changing.
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>({
    key: "",
    services: [],
    pagination: EMPTY_PAGE,
    failed: false,
  });

  const setQuery = useCallback((patch: Partial<GroomingServicesQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const key = JSON.stringify([lineId, settled, nonce]);

  useEffect(() => {
    if (!lineId) return;

    let active = true;

    serviceService
      .list({
        businessLineId: lineId,
        page: settled.page,
        limit: PAGE_SIZE,
        search: settled.search.trim() || undefined,
        isActive: settled.isActive === "" ? undefined : settled.isActive === "true",
        includeDeleted: settled.includeDeleted || undefined,
      })
      .then((result) => {
        if (active) {
          setLoaded({
            key,
            services: result.items,
            pagination: result.pagination,
            failed: false,
          });
        }
      })
      .catch(() => {
        if (active) {
          setLoaded({ key, services: [], pagination: EMPTY_PAGE, failed: true });
        }
      });

    return () => {
      active = false;
    };
  }, [key, lineId, settled]);

  const current = loaded.key === key;

  return {
    services: loaded.services,
    pagination: loaded.pagination,
    query,
    setQuery,
    refetch,
    loading: lineId !== null && !current,
    error:
      current && loaded.failed
        ? "Daftar layanan grooming tidak bisa dimuat. Coba lagi."
        : null,
  };
}
