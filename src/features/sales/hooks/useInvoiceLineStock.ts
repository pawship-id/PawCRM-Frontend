"use client";

import { useLiveStock } from "@/features/inventory/hooks/useLiveStock";
import { qtyAtWarehouse } from "@/features/inventory/utils/ledger";

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
 * FETCHED WHEN A PRODUCT JOINS THE BILL — not read off the picker's rows,
 * because a scanned lot brings no stock with it — and again for every line when
 * somebody comes back to the tab. ONE REQUEST each time however many lines
 * (`useLiveStock`): it used to be one `GET /products/:id` per product, so fifty
 * picked at once were fifty requests. Changing the warehouse re-reads the rows
 * already in hand rather than asking again.
 *
 * BEST EFFORT AND SILENT, like the form's pet list: a product that cannot be read
 * simply shows no stock note, and the server still checks the shelf on save.
 */
export function useInvoiceLineStock(productIds: string[]) {
  const live = useLiveStock(productIds);

  /** On hand at `warehouseId`, or null while unknown — not read yet, or unreadable. */
  const qtyAt = (productId: string, warehouseId: string): string | null => {
    const stock = live.rowsOf(productId);
    return stock ? qtyAtWarehouse(stock, warehouseId) : null;
  };

  return { qtyAt };
}
