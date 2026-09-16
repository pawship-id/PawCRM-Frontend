"use client";

import { useCallback } from "react";

import { usePetOptions } from "@/hooks/usePetOptions";

import {
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
 *   loading             — the list has not arrived. A screen that GENERATES rows
 *                         waits for it: rows built from a half-known table would
 *                         key a draft that the full table then contradicts.
 *   error               — it could not be loaded. Labels still fall back to the
 *                         seeded words, and the stored values still show.
 */
export function useVariantAxisValues() {
  const { options, label, loading, error } = usePetOptions();

  const valuesFor = useCallback(
    (variants?: readonly StoredVariantValues[] | null): VariantAxisValues =>
      variantAxisValues(options, variants, label),
    [options, label],
  );

  return { valuesFor, loading, error };
}
