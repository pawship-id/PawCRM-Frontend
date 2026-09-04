/**
 * The reports contract — `/api/reports`.
 *
 * Quantities and money are decimal STRINGS in both directions, like everywhere
 * else here. Nothing in this file parses them; `utils/decimal.ts` does the
 * arithmetic when a screen needs it.
 */

/** One product's stock at one warehouse. */
export interface StockOnHandRow {
  productId: string;
  sku: string | null;
  name: string;
  productType: string;
  unit: string;
  minStock: number;

  categoryId: string | null;
  /** Null when the category was deleted out from under the product. */
  categoryName: string | null;

  warehouseId: string | null;
  warehouseName: string | null;

  /**
   * BOTH NULLABLE, and legitimately so.
   *
   * A warehouse belongs to a branch by soft default (PCR-019), so one set up for
   * a bazaar genuinely belongs to none. The screen groups those under "Tanpa
   * cabang" rather than hiding them — stock nobody visits is exactly the stock a
   * valuation exists to surface.
   */
  branchId: string | null;
  branchName: string | null;

  qty: string;
  /**
   * NULL means no cost basis yet — the product has never been received — and it
   * is NOT the same as zero. Rendering it "Rp 0" would turn "we do not know what
   * this is worth" into "this is worth nothing", and only the first is a
   * data-entry problem the owner should chase.
   */
  hppAvg: string | null;
  /** `qty × hppAvg`, computed server-side. Null whenever `hppAvg` is. */
  value: string | null;

  /** At or below the restock threshold. False when the threshold is zero. */
  isLow: boolean;
}

/**
 * Totals for the WHOLE filtered set, not for the page on screen.
 *
 * `productCount` counts distinct products rather than rows: one product in three
 * warehouses is three rows and one thing to reorder.
 */
export interface StockOnHandTotals {
  qty: string;
  value: string;
  productCount: number;
}

export interface StockOnHandQuery {
  page?: number;
  limit?: number;
  warehouseId?: string;
  /** Matches warehouses whose DEFAULT branch this is — see `branchId` above. */
  branchId?: string;
  categoryId?: string;
  /** Keep rows whose quantity is zero. Excluded by default. */
  includeZero?: boolean;
}

export interface StockOnHandResult {
  items: StockOnHandRow[];
  totals: StockOnHandTotals;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
