"use client";

import { useEffect, useRef, useState } from "react";

import { qtyAtWarehouse } from "@/features/inventory/utils/ledger";
import { productService } from "@/services/product.service";
import type { ProductStockRow } from "@/types/inventory";

/**
 * How much of each product on the bill one warehouse holds — the "Stok 9" under
 * a line's SKU in Faktur baru (14 September 2026, the BO mockup).
 *
 * THE SAME FIGURE THE SERVER REFUSES AGAINST. `stockByWarehouse` is assembled
 * from `productstocks`, one row per product per WAREHOUSE — the number
 * `CustomerInvoiceService#assertStockAvailable` reads when the invoice is saved.
 * Every movement that touches a lot moves that row in the same write, so it IS
 * the sum of the product's batches in that warehouse; adding up the batches here
 * would be a second answer to a settled question, free to disagree with the save.
 *
 * PER WAREHOUSE, NOT PER BRANCH. A branch keeps books; a warehouse holds stock.
 * The Gudang picker offers only the chosen branch's warehouses and the central
 * ones, so the warehouse already answers "at this branch".
 *
 * FETCHED ONCE PER PRODUCT, when it joins the bill — not read off the picker's
 * rows, because a scanned lot brings no stock with it. Changing the warehouse
 * re-reads the rows already in hand rather than asking again.
 *
 * BEST EFFORT AND SILENT, like the form's pet list: a product that cannot be read
 * simply shows no stock note, and the server still checks the shelf on save.
 */
export function useInvoiceLineStock(productIds: string[]) {
  const [rows, setRows] = useState<Map<string, ProductStockRow[]>>(
    () => new Map(),
  );
  /** Asked for already — so a re-render never asks twice. */
  const requested = useRef(new Set<string>());

  /* A STABLE KEY for the set of ids, so the effect runs when a product joins the
     bill and not on every keystroke in a quantity box. */
  const key = [...new Set(productIds)].sort().join(",");

  useEffect(() => {
    /* The same Set for the life of the hook — held here so the cleanup below
       reads the one this run wrote to. */
    const asked = requested.current;
    const missing = key
      .split(",")
      .filter((id) => id !== "" && !asked.has(id));

    if (missing.length === 0) return;

    missing.forEach((id) => asked.add(id));

    let active = true;
    let settled = false;

    Promise.all(
      missing.map((id) =>
        productService
          .getById(id)
          .then((product) => [id, product.stockByWarehouse ?? []] as const)
          .catch(() => null),
      ),
    ).then((results) => {
      settled = true;
      if (!active) return;

      setRows((current) => {
        const next = new Map(current);
        results.forEach((result) => {
          if (result) next.set(result[0], [...result[1]]);
        });
        return next;
      });
    });

    return () => {
      active = false;
      /* NOT ANSWERED BEFORE THE BILL CHANGED — forget the ask, so the next run
         asks again instead of waiting on a reply this one threw away. */
      if (!settled) missing.forEach((id) => asked.delete(id));
    };
  }, [key]);

  /** On hand at `warehouseId`, or null while unknown — not read yet, or unreadable. */
  const qtyAt = (productId: string, warehouseId: string): string | null => {
    const stock = rows.get(productId);
    return stock ? qtyAtWarehouse(stock, warehouseId) : null;
  };

  return { qtyAt };
}
