"use client";

import { useEffect, useState } from "react";

import { branchService } from "@/services/branch.service";
import { categoryService } from "@/services/category.service";
import { warehouseService } from "@/services/warehouse.service";
import { useAuth } from "@/features/auth";
import {
  accessibleBranches,
  accessibleWarehouses,
} from "@/utils/accessScope";
import type { Branch, Category } from "@/types/api";
import type { StockWarehouse } from "@/types/inventory";

interface UseReportLookupsResult {
  branches: Branch[];
  warehouses: StockWarehouse[];
  categories: Category[];
  loading: boolean;
}

/**
 * The three dropdowns the stock reports filter by, fetched once together.
 *
 * CONCURRENTLY, because they are independent and awaiting them in sequence would
 * make the filter bar appear a third at a time.
 *
 * NO ERROR STATE, deliberately. A lookup that fails leaves its dropdown holding
 * only "Semua …", which still produces a usable report — the unfiltered one.
 * Painting an error banner across a working screen because a filter list is
 * missing would be a worse outcome than the missing filter, and the report's own
 * error handling still covers the request that matters.
 *
 * Inactive warehouses are INCLUDED, matching `useWarehouseOptions`: a closed
 * location still holds whatever was left in it, and stock nobody visits is
 * exactly what a valuation report exists to surface.
 *
 * BRANCHES AND WAREHOUSES ARE NARROWED TO THE SIGNED-IN USER'S OWN. The report
 * endpoint refuses a filter outside that reach with a 403 and narrows the rows
 * regardless, so offering one here could only produce that refusal. A courtesy
 * over the server's answer, never the isolation itself — `utils/accessScope.ts`
 * says why. Categories are not scoped: a catalogue is the tenant's, not a
 * location's.
 */
export function useReportLookups(): UseReportLookupsResult {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<StockWarehouse[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.allSettled([
      branchService.list({ limit: 100 }),
      warehouseService.list({ limit: 100 }),
      categoryService.list({ limit: 100 }),
    ])
      .then(([branch, warehouse, category]) => {
        if (!active) return;

        if (branch.status === "fulfilled") {
          setBranches(accessibleBranches(user, branch.value.items));
        }
        if (warehouse.status === "fulfilled") {
          setWarehouses(accessibleWarehouses(user, warehouse.value.items));
        }
        if (category.status === "fulfilled") setCategories(category.value.items);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  return { branches, warehouses, categories, loading };
}
