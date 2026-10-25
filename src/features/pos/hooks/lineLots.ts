import type { PosLot } from "@/types/api";

export interface LotShare {
  batchId: string;
  qty: string;
}

/**
 * The lots of a product line after ONE MORE unit goes on it (25 Oct 2026, BO).
 *
 * A SCANNED LOT IS THE LOT THAT IS SOLD. Scanning a carton's batch label names
 * its lot, and scanning the same product again — the same lot or another —
 * stays ONE line whose lots add up: two scans of B1 and one of B2 is qty 3,
 * B1 × 2 + B2 × 1, which is exactly what the line dialog then shows.
 *
 * THE SERVER TAKES ALL OR NOTHING: once a line names lots they must add up to
 * its quantity. So whatever is not named — the units already on a FEFO line
 * when the first batch scan arrives, or a tap on a line that already names
 * lots — is placed here the way FEFO would, soonest-expiring first, on what
 * each lot still holds after the named shares. `lots` must be in that order
 * (it is, from GET /pos/catalog/:id/lots).
 *
 * NULL WHEN IT CANNOT ADD UP — the shelf in the books holds less than the line
 * asks. The caller then drops the named lots and lets FEFO decide at posting,
 * which is what stepping the quantity has always done.
 */
export function lotsWithOneMore({
  named,
  lineQty,
  scannedBatchId,
  lots,
}: {
  /** The lots the line names now; empty for a FEFO line. */
  named: LotShare[];
  /** The line's quantity BEFORE this unit. */
  lineQty: number;
  /** The lot the new unit was scanned from; null for a tap or a SKU scan. */
  scannedBatchId: string | null;
  /** The product's lots at the till's warehouse, soonest expiry first. */
  lots: PosLot[];
}): LotShare[] | null {
  const shares = new Map<string, number>();
  for (const share of named) {
    shares.set(share.batchId, (shares.get(share.batchId) ?? 0) + Number(share.qty));
  }
  if (scannedBatchId) {
    shares.set(scannedBatchId, (shares.get(scannedBatchId) ?? 0) + 1);
  }

  // A FEFO line's units are all unplaced; a tap adds one more unplaced unit.
  let left = (named.length === 0 ? lineQty : 0) + (scannedBatchId ? 0 : 1);

  for (const lot of lots) {
    if (left <= 0) break;
    const room = Math.floor(Number(lot.qtyRemaining)) - (shares.get(lot._id) ?? 0);
    const take = Math.min(left, room);
    if (take <= 0) continue;
    shares.set(lot._id, (shares.get(lot._id) ?? 0) + take);
    left -= take;
  }

  if (left > 0) return null;

  return [...shares].map(([batchId, qty]) => ({ batchId, qty: String(qty) }));
}
