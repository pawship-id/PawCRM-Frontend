"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { serviceService } from "@/services/service.service";
import type { Service } from "@/types/api";

/** The API's page ceiling, asked for in full. */
const LIMIT = 100;

export interface UseAddonServiceListResult {
  /** Live add-on services, active and retired, by name. */
  addons: Service[];
  /** Add-on id → how many live main services list it in `addonServiceIds`. */
  attachedCount: Record<string, number>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Pengaturan › Layanan › Add-on — every add-on service, and how many main
 * services carry each one.
 *
 * AN ADD-ON IS A SERVICE (`serviceType: "addon"`), not a catalogue of its own:
 * it is created and edited in the one service form, and attached from the main
 * service's form. So this is a read of GET /services, not a new endpoint.
 *
 * ONE LOAD OF THE WHOLE CATALOGUE, narrowed on the client, because the
 * "ditempel ke" figure lives on the MAIN services (`addonServiceIds`) — asking
 * for add-ons alone could not count it. A catalogue is tens of rows; paged to
 * `totalPages` all the same.
 */
export function useAddonServiceList(): UseAddonServiceListResult {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // The sanctioned fetch-effect shape this repo uses everywhere — the stale
    // response guard below is what makes the late setStates safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    (async () => {
      const items: Service[] = [];
      for (let page = 1; ; page += 1) {
        const result = await serviceService.list({ page, limit: LIMIT });
        items.push(...result.items);
        if (page >= result.pagination.totalPages) return items;
      }
    })()
      .then((items) => {
        if (!active) return;
        setServices(items);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat add-on. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [nonce]);

  const addons = services
    .filter((service) => service.serviceType === "addon")
    .sort((a, b) => a.name.localeCompare(b.name, "id"));

  const attachedCount: Record<string, number> = {};
  for (const service of services) {
    if (service.serviceType === "addon") continue;
    // `?? []` — a service stored before the field has no such key.
    for (const id of service.addonServiceIds ?? []) {
      attachedCount[id] = (attachedCount[id] ?? 0) + 1;
    }
  }

  return { addons, attachedCount, loading, error, refetch };
}
