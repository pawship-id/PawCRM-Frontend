"use client";

import { useCallback } from "react";

import { usePetOptions } from "@/hooks/usePetOptions";
import { useVariantOptions } from "@/hooks/useVariantOptions";
import { useZones } from "@/hooks/useZones";

import {
  variantAxisDefs,
  variantAxisValues,
  type StoredVariantValues,
  type VariantAxisValues,
} from "../variantAxes";

/**
 * The tenant's variant axis values, for a screen that prices or reads variants.
 *
 *   valuesFor(variants) — the table for one service: active options in order,
 *                         plus every value `variants` already prices. Pass the
 *                         STORED variants (not a draft's), so a row that was
 *                         priced before its option was retired stays on screen.
 *   axes                — the Opsi Varian cards a form may tick, in card order.
 *   loading             — the lists have not arrived. A screen that GENERATES rows
 *                         waits for it: rows built from a half-known table would
 *                         key a draft that the full table then contradicts.
 *   error               — it could not be loaded. Labels still fall back to the
 *                         seeded words, and the stored values still show.
 */
export function useVariantAxisValues() {
  const { options, label, loading, error } = usePetOptions();
  const cards = useVariantOptions();
  const zones = useZones();

  const valuesFor = useCallback(
    (variants?: readonly StoredVariantValues[] | null): VariantAxisValues =>
      variantAxisValues(options, variants, label, { cards: cards.items, zones: zones.items }),
    [options, label, cards.items, zones.items],
  );

  /** The axes a form may tick — one per Opsi Varian card, in card order. */
  const axes = variantAxisDefs(cards.items);

  return {
    valuesFor,
    axes,
    // Rows are generated from all three lists, so wait for all three.
    loading: loading || cards.loading || (!cards.loaded && !cards.error) || zones.loading,
    error: error ?? cards.error ?? zones.error,
  };
}
