"use client";

import { createListStore } from "@/hooks/createListStore";
import { variantOptionService } from "@/services/variantOption.service";
import type { VariantOption } from "@/types/api";

const store = createListStore<VariantOption>(
  async () => (await variantOptionService.list()).items,
  "Gagal memuat opsi varian.",
);

/**
 * The tenant's Opsi Varian cards — what a service's price may vary by — loaded
 * once for the whole app. `items` are the live cards in card order.
 */
export const useVariantOptions = store.useList;

/** Call after any write to a card or its values. */
export const invalidateVariantOptions = store.invalidate;
