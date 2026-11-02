import type { ImportRowVerdict } from "./bulkImport";

/**
 * The opname file contract — `/api/stock-opnames/:id/template` and `/import`.
 *
 * The column names (`stok_fisik`, `kode_batch`) stop at the parser, in
 * `features/inventory/utils/opnameImport.ts`. `stok_sistem` and `nama` never reach
 * a request: the template prints them for the person counting, and the server's
 * own quantity is the one that counts.
 */

/** One row of the sheet, as the API takes it. Cells are text; the server judges. */
export interface OpnameImportRow {
  rowNumber: number;
  sku?: string;
  physicalQty?: string;
  batchCode?: string;
  expiryDate?: string;
  notes?: string;
}

export type OpnameImportStatus =
  | "ok"
  | "not_found"
  | "duplicate_in_file"
  | "invalid";

/** What a clean row does to the sheet. `skip` is a blank `stok_fisik`. */
export type OpnameImportAction = "fill" | "add" | "new_batch" | "skip";

export interface OpnameImportVerdict
  extends ImportRowVerdict<OpnameImportStatus> {
  sku: string;
  productId: string | null;
  productName: string | null;
  action: OpnameImportAction;
  batchCode: string | null;
  expiryDate: string | null;
  systemQty: string | null;
  physicalQty: string | null;
  diffQty: string | null;
  notes: string | null;
}

export interface OpnameImportPreview {
  opnameNumber: string;
  summary: {
    rows: number;
    ok: number;
    problems: number;
    /** Rows that carry a count. */
    filled: number;
    /** Lines the file would add to the sheet. */
    added: number;
    /** Rows left blank, which change nothing. */
    skipped: number;
  };
  /** The gate, stated by the server. */
  canCommit: boolean;
  rows: OpnameImportVerdict[];
}

export interface OpnameImportInput {
  rows: OpnameImportRow[];
  fileName?: string;
}

export interface OpnameTemplate {
  opnameNumber: string;
  columns: string[];
  rows: Record<string, string>[];
}
