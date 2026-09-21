"use client";

import { createListStore } from "@/hooks/createListStore";
import { businessLineService, type BusinessLine } from "@/services/businessLine.service";

const store = createListStore<BusinessLine>(async () => {
  const result = await businessLineService.list({ limit: 100 });
  return result.items;
}, "Gagal memuat lini bisnis.");

/**
 * The tenant's lines of business, loaded once for the app — what an Opsi Varian
 * card is assigned to (22 September 2026). A tenant has a handful.
 */
export const useBusinessLines = store.useList;

/** Call after a line is added, renamed or removed. */
export const invalidateBusinessLines = store.invalidate;
