"use client";

import { createListStore } from "@/hooks/createListStore";
import { zoneService } from "@/services/zone.service";
import type { Zone } from "@/types/api";

const store = createListStore<Zone>(async () => {
  const items: Zone[] = [];
  for (let page = 1; ; page += 1) {
    const result = await zoneService.list({ page, limit: 100, includeDeleted: true });
    items.push(...result.items);
    if (page >= result.pagination.totalPages) break;
  }
  return items;
}, "Gagal memuat zona.");

/**
 * The tenant's zones, deleted ones included (a variant may still price one),
 * nearest first — loaded once for the whole app.
 */
export const useZones = store.useList;

/** Call after any zone write. */
export const invalidateZones = store.invalidate;
