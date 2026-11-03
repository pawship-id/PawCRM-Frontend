import type { ImportRowVerdict } from "./bulkImport";

/**
 * The contract of /api/products/bulk-update. The backend half is
 * `productBulkUpdate.service.js`.
 */

/** One row of the file, as text. A blank cell is left out. */
export interface ProductUpdateRow {
  rowNumber: number;
  sku?: string;
  nama?: string;
  harga_jual?: string;
  min_stok?: string;
  akun_penjualan?: string;
  sub_akun_penjualan?: string;
  merek?: string;
  status?: string;
}

export type ProductUpdateStatus =
  | "ok"
  | "not_found"
  | "duplicate_in_file"
  | "invalid";

/** One field the row would change. Money is a decimal string, never a number. */
export interface ProductUpdateChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface ProductUpdateVerdict
  extends ImportRowVerdict<ProductUpdateStatus> {
  productId: string | null;
  productName: string | null;
  /** `update` only on a clean row with something to write. */
  action: "update" | "skip";
  changes: ProductUpdateChange[];
}

export interface ProductUpdatePreview {
  summary: {
    rows: number;
    ok: number;
    problems: number;
    changed: number;
    unchanged: number;
  };
  canCommit: boolean;
  rows: ProductUpdateVerdict[];
}

export interface ProductUpdateResult {
  updatedCount: number;
  failedCount: number;
  updated: { rowNumber: number; sku: string }[];
  failed: { rowNumber: number; sku: string; message: string }[];
}

/** The product list's narrowing, as the template takes it. */
export interface ProductUpdateTemplateQuery {
  search?: string;
  categoryId?: string;
  productType?: "standalone" | "parent";
  isActive?: boolean;
}

/**
 * SIMPAN RUNS IN THE BACKGROUND: the answer is a job to watch, and the page may
 * be closed while it runs. `result` arrives once it is done.
 */
export interface ProductUpdateJob {
  _id: string;
  type: "product_bulk_update";
  status: "queued" | "running" | "done" | "failed";
  progress: { done: number; total: number };
  error: string | null;
  result: ProductUpdateResult | null;
  fileName: string | null;
  createdAt: string;
  finishedAt: string | null;
}
