"use client";

import { useEffect, useState } from "react";

import { supplierCategoryService } from "@/services/supplierCategory.service";
import { ApiError } from "@/services/api-error";
import type { SupplierCategory } from "@/types/api";

/** One page is enough for a picker; a tenant's label set is tens of rows. */
const OPTION_LIMIT = 100;

interface UseSupplierCategoryOptionsResult {
  categories: SupplierCategory[];
  loading: boolean;
  error: string | null;
}

/**
 * The supplier categories a supplier form may choose from.
 *
 * ACTIVE ONLY, asked of the server rather than filtered here — `isActive=true`
 * is what keeps a retired label out of the picker, and asking for it means the
 * picker and the endpoint can never disagree about which labels are on offer.
 *
 * `selectedId` IS FETCHED SEPARATELY when it is not in the active page, exactly
 * as useSupplierOptions does for a vendor, and for the same two ordinary cases:
 * a supplier filed under a label that has since been retired, and a label
 * sitting past the option limit. Without it the Select would render a value it
 * has no item for — an empty trigger that, the moment the form is saved,
 * silently re-files the supplier as ungrouped. SupplierFormFields labels such an
 * option "(nonaktif)" rather than hiding it.
 *
 * THE KIND FILTER IS THE RESOURCE, not a parameter: /api/supplier-categories
 * only ever returns `kind: "supplier"` documents. That is why this hook can
 * offer everything it receives — the API refuses any other category on save, so
 * the picker cannot offer something the server would reject.
 */
export function useSupplierCategoryOptions(
  selectedId?: string | null,
): UseSupplierCategoryOptionsResult {
  const [categories, setCategories] = useState<SupplierCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // Same sanctioned fetch-effect shape as useSupplierOptions, so the
    // heuristic lint rule is disabled here too.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    supplierCategoryService
      .list({ isActive: true, limit: OPTION_LIMIT, sort: "nameAsc" })
      .then(async (result) => {
        if (!active) return result.items;

        const hasSelected =
          !selectedId ||
          result.items.some((category) => category._id === selectedId);
        if (hasSelected) return result.items;

        // The selected label is retired, deleted or off the page. Fetch it by
        // id and put it back — see the header for why hiding it is worse.
        try {
          const selected = await supplierCategoryService.getById(selectedId);
          return [...result.items, selected];
        } catch {
          // Even a label that cannot be read must not silently vanish from the
          // form; the field renders the bare id in that case.
          return result.items;
        }
      })
      .then((items) => {
        if (!active) return;
        setCategories(items);
      })
      .catch((err) => {
        if (!active) return;
        setCategories([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Gagal memuat kategori supplier.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedId]);

  return { categories, loading, error };
}
