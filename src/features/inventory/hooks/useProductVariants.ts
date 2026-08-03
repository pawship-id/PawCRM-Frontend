"use client";

import { useCallback, useRef, useState } from "react";

import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-error";
import type { Product } from "@/types/inventory";

interface VariantsState {
  /** Loaded variants, keyed by parent id. Absent = never expanded. */
  byParent: Record<string, Product[]>;
  /** Parent ids currently in flight. */
  loading: Record<string, boolean>;
  /** Per-parent failure, so one bad expand does not blank the whole table. */
  errors: Record<string, string>;
}

interface UseProductVariantsResult extends VariantsState {
  /** Fetch a parent's variants unless they are already loaded or in flight. */
  load: (parentId: string) => void;
  /** Drop a parent's cache so the next expand refetches (after a mutation). */
  invalidate: (parentId?: string) => void;
}

/**
 * A parent's variants, fetched when the row is expanded and remembered after.
 *
 * LAZY, because a catalogue of thirty parents would otherwise issue thirty
 * requests to draw a screen on which every family is collapsed. The list already
 * carries what a collapsed row needs — `variantCount` and `variantStock` — so
 * the expand is the first moment the individual variants are worth asking for.
 *
 * CACHED, because collapsing and re-expanding a row is how people read a table,
 * and refetching each time makes that feel broken. The cache is dropped
 * explicitly by `invalidate` after a mutation, never on a timer: the only thing
 * that changes these rows is an edit the user just made.
 */
export function useProductVariants(): UseProductVariantsResult {
  const [state, setState] = useState<VariantsState>({
    byParent: {},
    loading: {},
    errors: {},
  });

  /**
   * Which parents have been asked about, in a ref rather than in state.
   *
   * The guard has to be readable BEFORE the request is issued, and state read
   * inside `load` would be the value from the render that produced this
   * callback — so a second expand would fire a second request while the cache it
   * was meant to consult was already there. Two clicks, two identical fetches.
   */
  const asked = useRef<Set<string>>(new Set());

  const load = useCallback((parentId: string) => {
    if (asked.current.has(parentId)) return;
    asked.current.add(parentId);

    setState((prev) => ({
      ...prev,
      loading: { ...prev.loading, [parentId]: true },
    }));

    productService
      .listVariants(parentId)
      .then((result) => {
        setState((prev) => ({
          byParent: { ...prev.byParent, [parentId]: result.items },
          loading: { ...prev.loading, [parentId]: false },
          errors: { ...prev.errors, [parentId]: "" },
        }));
      })
      .catch((err) => {
        // Dropped from `asked` so re-opening the row retries — a failed expand
        // that could never be attempted again would need a page reload to fix.
        asked.current.delete(parentId);
        setState((prev) => ({
          ...prev,
          loading: { ...prev.loading, [parentId]: false },
          errors: {
            ...prev.errors,
            [parentId]:
              err instanceof ApiError ? err.message : "Varian gagal dimuat.",
          },
        }));
      });
  }, []);

  const invalidate = useCallback((parentId?: string) => {
    if (parentId) asked.current.delete(parentId);
    else asked.current.clear();

    setState((prev) => {
      if (!parentId) return { byParent: {}, loading: {}, errors: {} };
      const byParent = { ...prev.byParent };
      delete byParent[parentId];
      return { ...prev, byParent };
    });
  }, []);

  return { ...state, load, invalidate };
}
