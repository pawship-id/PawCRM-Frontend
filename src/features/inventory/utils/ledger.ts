import { toMinor } from "@/utils/decimal";
import type { ProductBatch } from "@/types/inventory";

/**
 * The two derivations the stock card still makes for itself.
 *
 * IT USED TO MAKE A THIRD, and its absence is the point of this header. The
 * running balance was reconstructed here — anchored to the current on-hand
 * quantity and walked backwards through the rows — because the API returned no
 * balance and capped `limit` at 100. That worked only while no NEWER movement
 * was hidden, so the screen had to blank its own balance column whenever a user
 * filtered by movement type or set an end date, and had to load pages by
 * appending so the chain stayed contiguous.
 *
 * The backend now returns `balanceAfter` per row, summed over the whole ledger
 * including the rows the filters hide (PawCRM-Backend 0.20.0). The
 * reconstruction, the guard that decided when to trust it, and the append-only
 * paging it forced are all gone. What is left below is genuinely client-side:
 * an ordering choice and a lookup with a default.
 */

/**
 * Lots in the order the tab shows them: live ones in FEFO order, then the spent
 * ones as history.
 *
 * The API already sorts closest-to-expiring first, so this does NOT re-sort by
 * expiry — it only partitions. Exhausted lots are kept rather than filtered
 * because a quantity is never deleted, only driven to zero, and an auditor
 * tracing where stock went needs the row that has none left.
 */
export function partitionBatches(batches: ProductBatch[]): {
  live: ProductBatch[];
  spent: ProductBatch[];
} {
  const live: ProductBatch[] = [];
  const spent: ProductBatch[] = [];

  for (const batch of batches) {
    // Only a POSITIVE remainder is live — a lot at zero has nothing left to
    // pick, and a NEGATIVE one (a withdrawal outran its lot) has less than
    // nothing. Negatives sit with the spent rows but are labelled "minus" rather
    // than "habis", so the row that needs fixing is still the one that stands
    // out.
    if ((toMinor(batch.qtyRemaining) ?? 0n) > 0n) live.push(batch);
    else spent.push(batch);
  }

  return { live, spent };
}

/** The quantity one warehouse holds, from a product's `stockByWarehouse`. */
export function qtyAtWarehouse(
  stockByWarehouse: Array<{ warehouseId: string; qty: string }>,
  warehouseId: string,
): string {
  // Absent means zero: the backend writes no `productstocks` row until the first
  // movement, so "never traded here" and "traded down to nothing" look the same
  // and mean the same on a stock card.
  return (
    stockByWarehouse.find((row) => row.warehouseId === warehouseId)?.qty ??
    "0.0000"
  );
}
