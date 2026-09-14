"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import { serviceService } from "@/services/service.service";
import type { Branch, Service } from "@/types/api";

/*
  The detail page's three reads. Each follows `useGroomingServices`' shape: state
  is only ever set when a request settles, and "loading" is derived from whether
  what is held answers the current question.
*/

interface LoadedService {
  key: string;
  service: Service | null;
  error: string | null;
}

/**
 * One service, by id.
 *
 * A DELETED SERVICE IS A 404 HERE — `GET /services/:id` does not return one —
 * which is why the list never links a deleted row to this page.
 */
export function useGroomingService(serviceId: string) {
  const [nonce, setNonce] = useState(0);
  const key = `${serviceId}:${nonce}`;
  const [loaded, setLoaded] = useState<LoadedService>({
    key: "",
    service: null,
    error: null,
  });

  useEffect(() => {
    let active = true;

    serviceService
      .getById(serviceId)
      .then((service) => {
        if (active) setLoaded({ key, service, error: null });
      })
      .catch((error) => {
        if (!active) return;
        setLoaded({
          key,
          service: null,
          error:
            error instanceof ApiError && error.status === 404
              ? "Layanan ini tidak ditemukan. Mungkin sudah dihapus."
              : error instanceof ApiError
                ? error.message
                : "Layanan ini tidak bisa dimuat. Coba lagi.",
        });
      });

    return () => {
      active = false;
    };
  }, [key, serviceId]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  /** Hold what a write answered with, without a second round trip. */
  const replace = useCallback(
    (service: Service) => setLoaded((prev) => ({ ...prev, service })),
    [],
  );

  const current = loaded.key === key;

  return {
    service: loaded.service,
    // A refetch keeps what is on screen; only a first load shows a spinner.
    loading: !current && loaded.service === null,
    error: current ? loaded.error : null,
    refetch,
    replace,
  };
}

/**
 * Every add-on in the tenant (`all`) — what the Tahapan & Add-on tab offers to
 * tick — and the ones this service lists (`items`), in the order it lists them.
 *
 * ONE LIST CALL, NOT ONE PER ID, fetched once per page: deleted add-ons too — a
 * service can still list an add-on that was deleted since, and that is exactly
 * the thing the page should be able to say. Ticking or unticking re-derives
 * `items` from what is held, without a round trip. Capped at the API's page of
 * 100; an id not found in it is counted as `missing` rather than dropped
 * silently. `enabled` false (an add-on's own page) asks nothing.
 */
export function useServiceAddons(addonIds: string[], enabled: boolean) {
  const [loaded, setLoaded] = useState<{
    addons: Service[];
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let active = true;

    serviceService
      .list({ serviceType: "addon", limit: 100, includeDeleted: true })
      .then((result) => {
        if (active) setLoaded({ addons: result.items, failed: false });
      })
      .catch(() => {
        if (active) setLoaded({ addons: [], failed: true });
      });

    return () => {
      active = false;
    };
  }, [enabled]);

  if (!enabled || loaded === null) {
    return {
      all: [] as Service[],
      items: [] as Service[],
      missing: 0,
      loading: enabled,
      failed: false,
    };
  }

  const items = addonIds
    .map((id) => loaded.addons.find((addon) => addon._id === id))
    .filter((addon): addon is Service => addon !== undefined);

  return {
    all: loaded.addons,
    items,
    missing: loaded.failed ? 0 : addonIds.length - items.length,
    loading: false,
    failed: loaded.failed,
  };
}

/**
 * The branch names a service is offered at. `enabled` is `branches:read` AND the
 * service naming specific branches — "Semua cabang" needs no names.
 *
 * FAILS SOFTLY: without names the page says "2 cabang", which is true.
 */
export function useBranchNames(enabled: boolean): Branch[] | null {
  const [branches, setBranches] = useState<Branch[] | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let active = true;

    branchService
      .list({ limit: 100 })
      .then((result) => {
        if (active) setBranches(result.items);
      })
      .catch(() => {
        if (active) setBranches([]);
      });

    return () => {
      active = false;
    };
  }, [enabled]);

  return enabled ? branches : null;
}
