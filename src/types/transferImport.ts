import type { ImportRowVerdict } from "./bulkImport";

/**
 * The transfer file contract — `POST /api/stock-transfers/import/resolve`.
 *
 * NOTHING HERE IS STORED. The file fills the form and the ordinary save posts it.
 * The column names (`jumlah`, `kode_batch`) stop at the parser, in
 * `features/inventory/utils/transferImport.ts`.
 */

/** One row of the sheet, as the API takes it. Cells are text; the server judges. */
export interface TransferImportRow {
  rowNumber: number;
  sku?: string;
  qty?: string;
  batchCode?: string;
  notes?: string;
}

export type TransferImportStatus =
  | "ok"
  | "not_found"
  | "duplicate_in_file"
  | "short"
  | "invalid";

/** What the form needs to draw a row it did not get from the picker. */
export interface TransferImportProduct {
  _id: string;
  name: string;
  sku: string;
  unit: string | null;
  hasExpiry: boolean;
  hppAvg: string;
}

export interface TransferImportVerdict
  extends ImportRowVerdict<TransferImportStatus> {
  sku: string;
  productId: string | null;
  product: TransferImportProduct | null;
  /** Null while the cell is unusable. */
  qty: string | null;
  batchId: string | null;
  batchCode: string | null;
  autoFefo: boolean;
  notes: string | null;
  /** This line's ceiling: its lot when it named one, else the shelf. */
  available: string | null;
  /** What the source warehouse holds of the product. */
  onHand: string | null;
}

export interface TransferImportPreview {
  warehouseName: string;
  summary: { rows: number; ok: number; problems: number };
  /** The gate, stated by the server. The form is filled only when true. */
  canCommit: boolean;
  rows: TransferImportVerdict[];
}

export interface TransferImportInput {
  fromWarehouseId: string;
  rows: TransferImportRow[];
}
