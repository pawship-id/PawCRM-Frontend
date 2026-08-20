"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { stockMovementService } from "@/services/stockMovement.service";
import type { StockMovement } from "@/types/inventory";

interface UseTransferResult {
  /** The rows that LEFT the source, one per lot drawn from. */
  out: StockMovement[];
  /** Every row of the posting, both directions. */
  all: StockMovement[];
  loading: boolean;
  error: string | null;
}

/**
 * Everything one transfer moved, by its correlation id.
 *
 * THERE IS NO TRANSFER DOCUMENT — no collection, no number. What ties the rows
 * together is `reference.id`, an id the service mints per posting and stamps on
 * every row of it precisely so this question can be asked. See
 * StockMovementService: "Not called `_id`, because nothing in any collection has
 * this as its primary key."
 *
 * A LIMIT, NOT A PAGE. A transfer is one posting and this screen shows all of
 * it; a second page would be a transfer that was half-read. The cap is high
 * enough that only a transfer larger than any real one could reach it.
 */
const LIMIT = 200;

export function useTransfer(transferId: string): UseTransferResult {
  const [all, setAll] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    stockMovementService
      .list({
        referenceType: "transfer_manual",
        referenceId: transferId,
        limit: LIMIT,
      })
      .then((result) => {
        if (active) setAll(result.items);
      })
      .catch((err) => {
        if (!active) return;
        setAll([]);
        setError(
          err instanceof ApiError ? err.message : "Transfer gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [transferId]);

  return {
    all,
    /**
     * ONE SIDE, NOT BOTH. Every product moved produces a `transfer_out` and a
     * mirroring `transfer_in`, so rendering all of them would list every product
     * twice and read as double the goods. The outbound side is the one that says
     * what was taken and which lot it came from; the inbound is its reflection.
     */
    out: all.filter((movement) => movement.movementType === "transfer_out"),
    loading,
    error,
  };
}
