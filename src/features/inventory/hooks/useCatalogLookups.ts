"use client";

import { useEffect, useState } from "react";

import { categoryService } from "@/services/category.service";
import { warehouseService } from "@/services/warehouse.service";
import { ApiError } from "@/services/api-error";
import type { Category } from "@/types/api";
import type { StockWarehouse } from "@/types/inventory";

interface CatalogLookups {
  categories: Category[];
  /**
   * Active only by default — an inactive warehouse cannot accept an opening
   * balance, so offering it in a picker leads to a 400. See `includeInactive`.
   */
  warehouses: StockWarehouse[];
  loading: boolean;
  /** Non-null when either list failed — the screen shows this instead of guessing. */
  error: string | null;
}

interface CatalogLookupsOptions {
  /**
   * Load closed locations too. For NAMING rather than for picking: a product may
   * still hold stock at a warehouse nobody may post to any more, and a detail
   * screen that dropped those rows would report less stock than exists — while
   * one that kept them without the name would show a row labelled by an id.
   */
  includeInactive?: boolean;
}

/**
 * The two reference lists every catalogue screen needs: categories for the
 * filter and the form's picker, warehouses for the stock column and the opening
 * balance.
 *
 * Mirrors useLookups in the users feature — fetched in parallel, once on mount,
 * no cache and no refetch. Both are small, rarely-changing lists, and one
 * `loading`/`error` gates the section that needs them.
 *
 * A FAILURE HERE IS SHOWN, NOT SWALLOWED. These are separate permissions
 * (`categories:read`, `warehouses:read`) from `products:read`, so a role granted
 * only the latter gets a form whose category picker cannot be filled — and
 * "could not load categories" is an answer its user can act on, where an empty
 * dropdown is not.
 */
export function useCatalogLookups({
  includeInactive = false,
}: CatalogLookupsOptions = {}): CatalogLookups {
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<StockWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [categoryResult, warehouseResult] = await Promise.all([
          categoryService.list(),
          warehouseService.list(includeInactive ? {} : { isActive: true }),
        ]);
        if (!active) return;
        setCategories(categoryResult.items);
        setWarehouses(warehouseResult.items);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Kategori dan gudang gagal dimuat.",
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [includeInactive]);

  return { categories, warehouses, loading, error };
}
