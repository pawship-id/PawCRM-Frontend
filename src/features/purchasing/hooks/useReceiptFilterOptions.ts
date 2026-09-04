"use client";

import { useEffect, useState } from "react";

import { branchService } from "@/services/branch.service";
import { supplierService } from "@/services/supplier.service";
import { warehouseService } from "@/services/warehouse.service";
import type { Branch, Supplier } from "@/types/api";
import type { StockWarehouse } from "@/types/inventory";

/** One page each; a tenant has tens of vendors and locations, not thousands. */
const OPTION_LIMIT = 100;

interface ReceiptFilterOptions {
  suppliers: Supplier[];
  warehouses: StockWarehouse[];
  branches: Branch[];
}

/**
 * The three dropdowns the goods-receipt list filters by.
 *
 * DELIBERATELY UNFILTERED, unlike useSupplierOptions — and the difference is the
 * whole reason this is a separate hook. That one feeds FORMS, where an inactive
 * vendor must not be selectable because the API refuses a receipt against one.
 * This feeds a READ: a vendor deactivated last month still delivered everything
 * they delivered, and a filter that cannot name them is a filter that cannot find
 * their deliveries. The same holds for a closed warehouse, and for a branch that
 * has since shut — the deliveries it took still happened, and its books still
 * carry them.
 *
 * NO `loading` AND NO `error`. A filter whose options have not arrived yet simply
 * shows "Semua supplier", which is the correct answer for an unset filter anyway,
 * and a failure leaves the list unfiltered rather than blocking a screen whose
 * own data loaded fine. `suppliers:read` and `warehouses:read` are separate
 * permissions from `goodsReceipts:read`.
 */
export function useReceiptFilterOptions(): ReceiptFilterOptions {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<StockWarehouse[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    let active = true;

    supplierService
      .list({ limit: OPTION_LIMIT })
      .then((result) => {
        if (active) setSuppliers(result.items);
      })
      .catch(() => undefined);

    warehouseService
      .list({ limit: OPTION_LIMIT })
      .then((result) => {
        if (active) setWarehouses(result.items);
      })
      .catch(() => undefined);

    branchService
      .list({ limit: OPTION_LIMIT })
      .then((result) => {
        if (active) setBranches(result.items);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  return { suppliers, warehouses, branches };
}
