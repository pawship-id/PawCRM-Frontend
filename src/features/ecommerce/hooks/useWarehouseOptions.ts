"use client";

import { useEffect, useState } from "react";

import type { FilterOption } from "@/components";
import { warehouseService } from "@/services/warehouse.service";

/**
 * Active warehouses as picker options — where a store reads its stock from.
 * Only the forms that change a store need it; a failed load leaves the list
 * empty and the form explains why it cannot be saved.
 */
export function useWarehouseOptions() {
  const [options, setOptions] = useState<FilterOption<string>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    warehouseService
      .list({ isActive: true, limit: 100 })
      .then((page) => {
        if (active) {
          setOptions(page.items.map((warehouse) => ({ value: warehouse._id, label: warehouse.name })));
        }
      })
      .catch(() => {
        if (active) setOptions([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { options, loading };
}
