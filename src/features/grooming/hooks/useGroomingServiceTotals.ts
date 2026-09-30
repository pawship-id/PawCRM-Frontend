"use client";

import { useEffect, useState } from "react";

import { serviceService } from "@/services/service.service";
import type { ServiceKind } from "@/types/api";

interface Loaded {
  key: string;
  all: number;
  active: number;
}

/**
 * "6 aktif dari 6" — this module's whole catalogue of MAIN services (add-ons live
 * on Master › Layanan › Add-on), whatever the filters say. Two one-row queries read off `pagination.total`, the trick every header
 * hook here plays.
 *
 * BY KIND, NOT BY LINE (30 September 2026, on request) — see `useGroomingServices`.
 *
 * `version` IS BUMPED BY THE SCREEN after a delete or restore, the only things on
 * it that change either figure.
 *
 * NULL WHILE UNKNOWN OR FAILED: the line then reads "6 layanan" alone rather
 * than claiming a total it does not have.
 */
export function useGroomingServiceTotals(serviceKind: ServiceKind, version: number) {
  const key = `${serviceKind}:${version}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      serviceService.list({ serviceKind, serviceType: "main", limit: 1 }),
      serviceService.list({
        serviceKind,
        serviceType: "main",
        isActive: true,
        limit: 1,
      }),
    ])
      .then(([all, live]) => {
        if (active) {
          setLoaded({
            key,
            all: all.pagination.total,
            active: live.pagination.total,
          });
        }
      })
      .catch(() => {
        if (active) setLoaded(null);
      });

    return () => {
      active = false;
    };
  }, [key, serviceKind]);

  return loaded && loaded.key === key
    ? { all: loaded.all, active: loaded.active }
    : null;
}
