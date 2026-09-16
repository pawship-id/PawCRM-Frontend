"use client";

import { useEffect, useState } from "react";

import { serviceService } from "@/services/service.service";
import type { Service } from "@/types/api";

/** The API's page cap. */
const PAGE_LIMIT = 100;

/** A grooming menu of a thousand services is not a menu; stop asking there. */
const MAX_PAGES = 10;

async function listAll(businessLineId: string): Promise<Service[]> {
  const services: Service[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await serviceService.list({
      businessLineId,
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
 * EVERY service on the Grooming line, unpaged — what the board uses to tell a
 * grooming row from a hotel night, and what its Layanan filter offers.
 *
 * A FAILURE IS NOT FATAL. The board falls back to the line name each booking
 * row snapshots, so a role without `services:read` still sees its grooming.
 */
export function useGroomingCatalog(
  lineId: string | null,
  lineLoading: boolean,
): { services: Service[]; loading: boolean } {
  const [loaded, setLoaded] = useState<{
    lineId: string | null;
    services: Service[];
  }>({ lineId: null, services: [] });

  useEffect(() => {
    if (!lineId) return;

    let active = true;

    listAll(lineId)
      .then((services) => {
        if (active) setLoaded({ lineId, services });
      })
      .catch(() => {
        if (active) setLoaded({ lineId, services: [] });
      });

    return () => {
      active = false;
    };
  }, [lineId]);

  const current = lineId !== null && loaded.lineId === lineId;

  return {
    services: current ? loaded.services : [],
    loading: lineId === null ? lineLoading : !current,
  };
}
