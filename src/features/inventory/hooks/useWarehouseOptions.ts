"use client";

import { useEffect, useState } from "react";

import { warehouseService } from "@/services/warehouse.service";
import { ApiError } from "@/services/api-error";
import { useAuth } from "@/features/auth";
import { accessibleWarehouses } from "@/utils/accessScope";
import type { StockWarehouse } from "@/types/inventory";

interface UseWarehouseOptionsResult {
  warehouses: StockWarehouse[];
  loading: boolean;
  error: string | null;
}

/**
 * Just the warehouses, for a filter dropdown.
 *
 * SMALLER THAN `useStockCardLookups` ON PURPOSE. That hook also loads every
 * stock-holding product, which the stock screens need for their picker — this
 * one feeds a report whose rows already arrive naming their own product, so
 * paging the catalogue to render a dropdown would be a request nobody reads.
 *
 * INACTIVE WAREHOUSES INCLUDED. A closed location still holds the lots it held,
 * and their expiry dates do not stop mattering because nobody may post there any
 * more — if anything, forgotten stock is exactly what an expiry report exists to
 * surface.
 *
 * NARROWED TO THE SHELVES THIS USER REACHES, like every other lookup in this
 * module. A COURTESY, NOT THE ISOLATION — the server narrows every stock list
 * and refuses every out-of-scope filter on its own (see
 * `utils/warehouseScope.js`). This exists so a picker does not offer a warehouse
 * whose only possible outcome is a 403, and so a reader is not left wondering
 * why the table under a chosen location is empty. `isActive` and access are
 * different questions: a closed shelf a user OWNS still holds their lots, and a
 * live one in a shop they do not work in was never theirs to see.
 *
 * `enabled` EXISTS FOR SCREENS WHERE THE FILTER ITSELF IS OPTIONAL — the
 * inventory hub hides its warehouse picker when the role may read neither list
 * it narrows, and a lookup fired for a control nobody is shown is a request that
 * can only ever produce an error message about a feature the user cannot see.
 * Every other caller needs the list unconditionally and passes nothing.
 */
export function useWarehouseOptions(enabled = true): UseWarehouseOptionsResult {
  const { user } = useAuth();
  const [warehouses, setWarehouses] = useState<StockWarehouse[]>([]);
  // Starts idle when disabled, so a caller does not render a spinner for a
  // request that is never made.
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let active = true;

    warehouseService
      .list({ limit: 100 })
      .then((result) => {
        if (!active) return;
        setWarehouses(accessibleWarehouses(user, result.items));
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Daftar gudang gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [enabled, user]);

  return { warehouses, loading, error };
}
