"use client";

import { useEffect, useState } from "react";

import { branchService } from "@/services/branch.service";
import { customerService } from "@/services/customer.service";
import { productService } from "@/services/product.service";
import { stockEntryService } from "@/services/stockEntry.service";
import { supplierService } from "@/services/supplier.service";
import { warehouseService } from "@/services/warehouse.service";

/** One figure: how many there are, and whether we know yet. */
export interface SetupCount {
  total: number;
  loading: boolean;
  error: boolean;
}

/** Which counts the caller actually renders — see the note on waste below. */
export interface SetupCountGrants {
  branches?: boolean;
  warehouses?: boolean;
  products?: boolean;
  customers?: boolean;
  suppliers?: boolean;
  openingStock?: boolean;
}

export type SetupCounts = Record<keyof SetupCountGrants, SetupCount>;

const PENDING: SetupCount = { total: 0, loading: true, error: false };
const FAILED: SetupCount = { total: 0, loading: false, error: true };
/** Not asked for — either not rendered, or the caller holds no grant. */
const IDLE: SetupCount = { total: 0, loading: false, error: false };

/**
 * The counts the two Pengaturan screens are built out of: how much of the shop
 * is actually set up.
 *
 * ONE HOOK, SIX SWITCHES. Each flag means "I will render this figure AND the
 * caller may read it" — both halves, which is why the screens compute them from
 * `can(...)` and from what they draw. A `false` issues no request at all, so the
 * Umum hub costs two queries rather than the six Data Awal needs, and a role
 * without a grant never collects a 403 for a number it would not be shown.
 *
 * ONE ROW PER COUNT, NOT THE LIST: `limit: 1` and `pagination.total` — the trick
 * every header hook in this app plays.
 *
 * PRODUCTS ARE COUNTED AS THE CATALOGUE SEES THEM (`excludeVariants`), one row
 * per family. "248 SKU" on a setup checklist means "we registered 248 things",
 * not "the families spread into 760 rows" — the second number is true and
 * answers a question nobody is asking while importing a catalogue.
 */
export function useSetupCounts(grants: SetupCountGrants): SetupCounts {
  const {
    branches = false,
    warehouses = false,
    products = false,
    customers = false,
    suppliers = false,
    openingStock = false,
  } = grants;

  const [counts, setCounts] = useState<SetupCounts>({
    branches: IDLE,
    warehouses: IDLE,
    products: IDLE,
    customers: IDLE,
    suppliers: IDLE,
    openingStock: IDLE,
  });

  useEffect(() => {
    let active = true;

    const wanted: Record<keyof SetupCountGrants, boolean> = {
      branches,
      warehouses,
      products,
      customers,
      suppliers,
      openingStock,
    };

    // The sanctioned fetch-effect shape (see useLowStockAlert): everything the
    // caller wants goes back to pending before the requests that refill it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCounts({
      branches: branches ? PENDING : IDLE,
      warehouses: warehouses ? PENDING : IDLE,
      products: products ? PENDING : IDLE,
      customers: customers ? PENDING : IDLE,
      suppliers: suppliers ? PENDING : IDLE,
      openingStock: openingStock ? PENDING : IDLE,
    });

    const put = (key: keyof SetupCountGrants, next: SetupCount) => {
      if (active) setCounts((prev) => ({ ...prev, [key]: next }));
    };

    const ask = (
      key: keyof SetupCountGrants,
      request: () => Promise<{ pagination: { total: number } }>,
    ) => {
      if (!wanted[key]) return;
      request()
        .then((result) =>
          put(key, {
            total: result.pagination.total,
            loading: false,
            error: false,
          }),
        )
        .catch(() => put(key, FAILED));
    };

    ask("branches", () => branchService.list({ page: 1, limit: 1 }));
    ask("warehouses", () => warehouseService.list({ page: 1, limit: 1 }));
    ask("products", () =>
      productService.list({ page: 1, limit: 1, excludeVariants: true }),
    );
    ask("customers", () => customerService.list({ page: 1, limit: 1 }));
    ask("suppliers", () => supplierService.list({ page: 1, limit: 1 }));
    ask("openingStock", () =>
      stockEntryService.list({ kind: "opening_balance", page: 1, limit: 1 }),
    );

    return () => {
      active = false;
    };
  }, [branches, warehouses, products, customers, suppliers, openingStock]);

  return counts;
}
