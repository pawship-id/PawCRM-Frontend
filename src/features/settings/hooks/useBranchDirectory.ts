"use client";

import { useEffect, useState } from "react";

import { branchService } from "@/services/branch.service";
import { warehouseService } from "@/services/warehouse.service";
import type { Branch, Warehouse } from "@/types/api";

export interface BranchDirectory {
  branches: Branch[];
  warehouses: Warehouse[];
  loading: boolean;
  error: boolean;
}

/**
 * Every branch and every warehouse, for Pengaturan › Umum's "Cabang & gudang"
 * list — one page of each at the services' default of 100, which is the whole
 * set for any shop this app serves.
 *
 * TWO GRANTS, READ SEPARATELY. A role that may read branches but not warehouses
 * still gets its branch list, with the warehouse lines left out rather than the
 * section refused.
 */
export function useBranchDirectory({
  branches: wantBranches,
  warehouses: wantWarehouses,
}: {
  branches: boolean;
  warehouses: boolean;
}): BranchDirectory {
  const [state, setState] = useState<BranchDirectory>({
    branches: [],
    warehouses: [],
    loading: wantBranches,
    error: false,
  });

  useEffect(() => {
    if (!wantBranches) return;
    let active = true;

    // The sanctioned fetch-effect shape (see useSetupCounts).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((prev) => ({ ...prev, loading: true, error: false }));

    Promise.all([
      branchService.list({ page: 1 }),
      wantWarehouses
        ? warehouseService.list({ page: 1 })
        : Promise.resolve({ items: [] as Warehouse[] }),
    ])
      .then(([branches, warehouses]) => {
        if (!active) return;
        setState({
          branches: branches.items,
          warehouses: warehouses.items,
          loading: false,
          error: false,
        });
      })
      .catch(() => {
        if (active)
          setState((prev) => ({ ...prev, loading: false, error: true }));
      });

    return () => {
      active = false;
    };
  }, [wantBranches, wantWarehouses]);

  return state;
}
