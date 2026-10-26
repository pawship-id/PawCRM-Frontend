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
 * SHORT ON PAPER, THE NAMED LOTS STAY (25 Oct 2026, BO). What the books cannot
 * place goes on the LAST lot — as the server's FEFO does with a shortfall —
 * or, with no shelf to read, on the last lot the line names. Whether a lot may
 * go below zero is the shop's setting, judged by the server: it sells, or
 * refuses with the lot's name.
 *
 * NULL ONLY WHEN THERE IS NO LOT TO NAME AT ALL; the line then stays FEFO.
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

  if (left > 0) {
    const last = lots.at(-1)?._id ?? [...shares.keys()].at(-1);
    if (!last) return null;
    shares.set(last, (shares.get(last) ?? 0) + left);
  }

  return [...shares].map(([batchId, qty]) => ({ batchId, qty: String(qty) }));
}

/**
 * The lots of a line whose quantity was STEPPED in the basket (25 Oct 2026, BO)
 * — the named lots are kept, not dropped back to FEFO.
 *
 * UP: the extra units go where FEFO would put them, on what each lot still
 * holds after the named shares — `lots` in that order, as for
 * `lotsWithOneMore`. DOWN: the units come off the END of the list, so a minus
 * undoes the last lot that was scanned or added, and needs no `lots` at all.
 *
 * Short on paper, the extra units go on the last lot — see `lotsWithOneMore`.
 */
export function lotsAtQty({
  named,
  qty,
  lots,
}: {
  named: LotShare[];
  qty: number;
  lots: PosLot[];
}): LotShare[] | null {
  const held = named.reduce((sum, share) => sum + Number(share.qty), 0);

  if (qty <= held) {
    let drop = held - qty;
    const kept: LotShare[] = [];
    for (const share of [...named].reverse()) {
      const take = Math.min(drop, Number(share.qty));
      drop -= take;
      const left = Number(share.qty) - take;
      if (left > 0) kept.unshift({ batchId: share.batchId, qty: String(left) });
    }
    return kept.length > 0 ? kept : null;
  }

  let result: LotShare[] | null = named;
  for (let count = held; count < qty && result; count += 1) {
    result = lotsWithOneMore({
      named: result,
      lineQty: count,
      scannedBatchId: null,
      lots,
    });
  }
  return result;
}

