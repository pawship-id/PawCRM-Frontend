"use client";

import { useEffect, useState } from "react";

import { serviceService } from "@/services/service.service";
import type { Service, ServiceKind } from "@/types/api";

/** The API's page cap. */
const PAGE_LIMIT = 100;

/** A grooming menu of a thousand services is not a menu; stop asking there. */
const MAX_PAGES = 10;

async function listAll(serviceKind: ServiceKind): Promise<Service[]> {
  const services: Service[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await serviceService.list({
      serviceKind,
      /* A booking is for a main service; add-ons are not the board's (22 Sep 2026). */
      serviceType: "main",
      /* Deleted too: an old booking still names a retired service. */
      includeDeleted: true,
      page,
      limit: PAGE_LIMIT,
    });
    services.push(...result.items);
    if (page >= result.pagination.totalPages) break;
  }

  return services;
}

/**
 * EVERY main service of this kind, unpaged — what the board uses to tell a
 * grooming row from a hotel night, and what its Layanan filter offers.
 *
 * ─── BY KIND, NOT BY LINE (30 September 2026, on request) ──────────────────
 *
 * It asked for a business line by id until then, which the module found by
 * NAME. A lini bisnis is a free label a tenant need never create — a shop that
 * reports every takings under one line got an EMPTY catalogue here, so its
 * board could not tell a grooming row from anything else and its Layanan filter
 * offered nothing. `serviceKind` is a fixed word the service itself carries, so
 * there is no lookup to fail and no loading to wait on.
 *
 * A FAILURE IS NOT FATAL. The board falls back to the line name each booking
 * row snapshots, so a role without `services:read` still sees its grooming.
 */
export function useGroomingCatalog(serviceKind: ServiceKind): {
  services: Service[];
  loading: boolean;
} {
  const [loaded, setLoaded] = useState<{
    serviceKind: ServiceKind | null;
    services: Service[];
  }>({ serviceKind: null, services: [] });

  useEffect(() => {
    let active = true;

    listAll(serviceKind)
      .then((services) => {
        if (active) setLoaded({ serviceKind, services });
      })
      .catch(() => {
        if (active) setLoaded({ serviceKind, services: [] });
      });

    return () => {
      active = false;
    };
  }, [serviceKind]);

  const current = loaded.serviceKind === serviceKind;

  return {
    services: current ? loaded.services : [],
    loading: !current,
  };
}
