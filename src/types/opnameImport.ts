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
    /** How many sheets the file fills. More than one: the commit runs in the background. */
    sheets: number;
  };
  /** True when the commit will queue a background job rather than fill the sheet. */
  background: boolean;
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

/**
 * WORK THE SERVER DOES AFTER ANSWERING — a file split across sheets, or Submit
 * semua. Polled for its progress; the page can be left while it runs.
 */
export type OpnameJobType = "opname_import" | "opname_submit_all";
export type OpnameJobStatus = "queued" | "running" | "done" | "failed";

export interface OpnameJobSheet {
  _id: string;
  opnameNumber: string;
  groupIndex: number | null;
  itemCount: number;
}

export interface OpnameJob {
  _id: string;
  type: OpnameJobType;
  status: OpnameJobStatus;
  subjectId: string | null;
  progress: { done: number; total: number };
  error: string | null;
  result: { sheets?: OpnameJobSheet[]; submitted?: string[] } | null;
  /** The sheet an import started from. */
  opnameNumber: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/** What the import answers with when the file was bigger than one sheet (202). */
export interface OpnameImportQueued {
  background: true;
  job: OpnameJob;
}
