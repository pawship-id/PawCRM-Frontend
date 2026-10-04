"use client";

import { useEffect, useState } from "react";

import { customerInvoiceService } from "@/services/customerInvoice.service";
import type { CustomerInvoiceFilterOptions } from "@/types/api";

const EMPTY: CustomerInvoiceFilterOptions = {
  branches: [],
  warehouses: [],
  creators: [],
};

/**
 * The cabang, gudang and kasir the Penjualan list can be filtered by.
 *
 * FROM `/customer-invoices/filter-options`, NOT FROM THE MASTER LISTS. Two
 * reasons, and the second is the one that forced it:
 *
 *   - only values that appear on an invoice come back, so no option empties the
 *     table the moment it is picked;
 *   - `/branches` and `/users` are gated on `branches:read` and `users:read`,
 *     which a collections role reading this screen very often lacks. Its Kasir
 *     filter used to be impossible to fill for exactly the people who use it.
 *
 * NO `loading` AND NO `error`. A filter whose options have not arrived shows
 * "Semua …", which is the right answer for an unset filter anyway, and a failure
 * leaves the list unfiltered rather than blocking a screen whose rows loaded.
 */
export function useReceivableFilterOptions(): CustomerInvoiceFilterOptions {
  const [options, setOptions] = useState<CustomerInvoiceFilterOptions>(EMPTY);

  useEffect(() => {
    let active = true;

    customerInvoiceService
      .filterOptions()
      .then((result) => {
        if (active) setOptions(result);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  return options;
}
