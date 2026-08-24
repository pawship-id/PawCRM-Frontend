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
 * READ WHOLE, NOT PAGED. A transfer is one posting and this screen shows all of
 * it; a second page would be a transfer that was half-read.
 *
 * THE API CAPS A PAGE AT 100 ROWS (`common.validation.js`), so "all of it" is
 * assembled here rather than asked for in one request. This used to ask for 200
 * in a single call, which the backend rejected as a validation error — so the
 * detail failed for EVERY transfer, including the one-line ones the cap was
 * never about.
 */
const PAGE_LIMIT = 100;

/**
 * A backstop, not an expected bound: 2 000 rows is a transfer of hundreds of
 * products across hundreds of lots. It exists so a wrong `totalPages` cannot
 * turn one screen into an unbounded fetch loop.
 */
const MAX_PAGES = 20;

/**
 * Every row of one posting, following the pages the cap creates.
 *
 * Page one first — it carries the count that says whether there are more — then
 * the rest at once, since they do not depend on each other. Ordering is stable
 * across the pages because the API's sort breaks ties on `_id`.
 */
async function fetchRows(transferId: string): Promise<StockMovement[]> {
  const query = {
    referenceType: "transfer_manual" as const,
    referenceId: transferId,
    limit: PAGE_LIMIT,
  };

  const first = await stockMovementService.list(query);
  const pages = Math.min(first.pagination.totalPages, MAX_PAGES);
  if (pages <= 1) {
    return first.items;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      stockMovementService.list({ ...query, page: index + 2 }),
    ),
  );

  return [...first.items, ...rest.flatMap((page) => page.items)];
}

export function useTransfer(transferId: string): UseTransferResult {
  const [all, setAll] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    fetchRows(transferId)
      .then((items) => {
        if (active) setAll(items);
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
