"use client";

import { useEffect, useState } from "react";

import { supplierService } from "@/services/supplier.service";
import { ApiError } from "@/services/api-error";
import type { Supplier } from "@/types/api";

/** One page is enough for a picker; a tenant has tens of vendors, not thousands. */
const OPTION_LIMIT = 100;

interface UseSupplierOptionsResult {
  suppliers: Supplier[];
  loading: boolean;
  error: string | null;
}

/**
 * The suppliers a purchasing form may choose from.
 *
 * ACTIVE ONLY, asked of the server rather than filtered here: `isActive=true` is
 * what keeps a deactivated vendor out of the picker, and the API applies the
 * same rule when it refuses a receipt. Filtering client-side would mean the
 * picker and the endpoint could disagree about which vendors are available.
 *
 * `selectedId` IS FETCHED SEPARATELY when it is not in the active page. Two
 * cases need it and both are ordinary: a form editing a document raised before
 * the vendor was deactivated, and a vendor sitting past the option limit.
 * Without it the Select would render a value it has no item for — which shows an
 * empty trigger and, the moment the form is saved, silently rewrites the field.
 * SupplierSelect labels such an option "(nonaktif)" rather than hiding it.
 */
export function useSupplierOptions(
  selectedId?: string | null,
): UseSupplierOptionsResult {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    supplierService
      .list({ isActive: true, limit: OPTION_LIMIT })
      .then(async (result) => {
        if (!active) return result.items;

        const hasSelected =
          !selectedId ||
          result.items.some((supplier) => supplier._id === selectedId);
        if (hasSelected) return result.items;

        // The selected vendor is deactivated, deleted or off the page. Fetch it
        // by id and put it back — see the header for why hiding it is worse.
        try {
          const selected = await supplierService.getById(selectedId);
          return [...result.items, selected];
        } catch {
          // Even a vendor that cannot be read must not silently vanish from the
          // form; SupplierSelect renders the bare id in that case.
          return result.items;
        }
      })
      .then((items) => {
        if (!active) return;
        setSuppliers(items);
      })
      .catch((err) => {
        if (!active) return;
        setSuppliers([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Gagal memuat daftar supplier.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedId]);

  return { suppliers, loading, error };
}
