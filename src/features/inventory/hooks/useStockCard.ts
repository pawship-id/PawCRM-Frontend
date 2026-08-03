"use client";

import { useEffect, useState } from "react";

import { stockMovementService } from "@/services/stockMovement.service";
import { ApiError } from "@/services/api-error";
import type {
  MovementType,
  StockMovement,
  StockMovementPage,
} from "@/types/inventory";

/** The filters the stock card's toolbar drives. Empty string = unset. */
export interface StockCardFilters {
  warehouseId: string;
  productId: string;
  movementType: MovementType | "";
  /** `yyyy-mm-dd` from a date input, or "". */
  from: string;
  to: string;
}

export const EMPTY_FILTERS: StockCardFilters = {
  warehouseId: "",
  productId: "",
  movementType: "",
  from: "",
  to: "",
};

const PAGE_SIZE = 50;

const EMPTY_PAGINATION: StockMovementPage["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

interface UseStockCardResult {
  /** One page, newest first. Each row carries its own `balanceAfter`. */
  movements: StockMovement[];
  pagination: StockMovementPage["pagination"];
  /** The balance before the page's oldest row, or null when unanswerable. */
  openingBalance: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * The ledger behind the stock card: filters and a page number in, one page out.
 *
 * ORDINARY PAGE-JUMP PAGING, like every other list in this codebase — and that
 * is worth a note, because it did not used to be. This hook accumulated pages
 * and offered only "muat lebih banyak", because the balance was reconstructed
 * client-side by walking backwards from the current on-hand quantity, which is
 * valid only while the loaded rows run contiguously from the newest one. Jumping
 * to page four would have left three pages of unseen movements between the
 * anchor and the first visible row.
 *
 * The API now returns `balanceAfter` per row (PawCRM-Backend 0.20.0), computed
 * over the whole ledger including the rows the filters hide. Each page is
 * therefore correct on its own, the accumulation is gone, and a user can jump
 * straight to the oldest page of a two-year history.
 *
 * NOTHING IS FETCHED UNTIL BOTH IDS ARE SET. Without them the same endpoint
 * returns the tenant's entire ledger — a large, slow answer to a question the
 * screen did not ask — and the server, correctly, returns no balance for it.
 */
export function useStockCard(
  filters: StockCardFilters,
  page: number,
  /** Bumped by the screen to re-read the ledger, the tiles and the lots together. */
  refreshKey: number,
): UseStockCardResult {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [pagination, setPagination] =
    useState<StockMovementPage["pagination"]>(EMPTY_PAGINATION);
  const [openingBalance, setOpeningBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { productId, warehouseId, movementType, from, to } = filters;
  const ready = Boolean(productId && warehouseId);

  useEffect(() => {
    if (!ready) return;

    let active = true;
    // The sanctioned fetch-effect shape in this codebase (see useProducts):
    // show loading, synchronize, and guard the late setStates with `active`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    stockMovementService
      .list({
        page,
        limit: PAGE_SIZE,
        productId,
        warehouseId,
        movementType: movementType || undefined,
        // The inputs give a date; the API bounds `createdAt`, a timestamp. `to`
        // is pushed to the end of its day so "sampai 3 Agustus" includes the
        // movements posted on 3 August rather than only the stroke of midnight.
        from: from ? `${from}T00:00:00.000Z` : undefined,
        to: to ? `${to}T23:59:59.999Z` : undefined,
      })
      .then((result) => {
        if (!active) return;
        setMovements(result.items);
        setPagination(result.pagination);
        setOpeningBalance(result.openingBalance);
      })
      .catch((err) => {
        if (!active) return;
        setMovements([]);
        setPagination(EMPTY_PAGINATION);
        setOpeningBalance(null);
        setError(
          err instanceof ApiError
            ? err.message
            : "Kartu stok gagal dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [ready, productId, warehouseId, movementType, from, to, page, refreshKey]);

  return { movements, pagination, openingBalance, loading, error };
}
