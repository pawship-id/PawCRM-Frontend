/**
 * The bulk product import contract — `/api/products/import`.
 *
 * Its own file rather than a corner of `types/inventory.ts`, because none of
 * this describes a stored thing. A product, a lot and a movement are documents;
 * a row and a verdict exist for the length of one upload and are never read
 * back. Mixing them into the catalogue types would mean an import shape and a
 * product shape being maintained as if they had the same lifetime.
 *
 * THE COLUMN NAMES ARE NOT HERE. `sku`, `parent_sku` and friends are the
 * SPREADSHEET's vocabulary, and they stop existing at the parser — see
 * `features/inventory/utils/sheet.ts`. What crosses the wire is the field names
 * below, and the two are deliberately different words so that renaming a column
 * for legibility cannot silently change an API payload.
 *
 * Quantities and money are decimal STRINGS in both directions, like everywhere
 * else in this codebase. Nothing here parses them.
 */

/** One row of the sheet, as the API takes it. */
export interface ImportRow {
  /**
   * The spreadsheet's OWN row number — 1-based, counting the header.
   *
   * Sent because only the client knows it. Blank rows are dropped by the parser
   * and never reach the server, so a server-side index would drift from what the
   * user sees in Excel by however many empty rows sit above. Every verdict comes
   * back addressed to this number, which is the whole reason a five-hundred-row
   * file is fixable at all.
   */
  rowNumber: number;

  /** Blank on a standalone; the family's code on a variant. */
  parentSku?: string;
  /** The family's name. Read from the first row of each family. */
  parentName?: string;

  sku?: string;
  name?: string;
  barcode?: string;
  /** By NAME — resolved server-side against the tenant's own categories. */
  categoryName?: string;
  unit?: string;
  sellPrice?: string;
  minStock?: number;
  /**
   * Sent as whatever the cell held. The server accepts `ya`/`y`/`1`/`true` and
   * `tidak`/`t`/`0`/`false`/blank, so the parser does not have to guess which
   * spelling a tenant's file uses.
   */
  hasExpiry?: string | boolean;

  openingQty?: string;
  /** REQUIRED by the server whenever `openingQty` is filled in. */
  openingCost?: string;
  batchCode?: string;
  expiryDate?: string;

  /**
   * A variant's position on its family's axes, keyed by axis name.
   *
   * Built by the parser from the `attr_*` columns, prefix stripped. The prefix
   * lives only in the sheet, where it is what tells a variable column from a
   * fixed one.
   */
  attributes?: Record<string, string>;
}

/**
 * A row's verdict. `ok` is the only one the commit accepts.
 *
 * `duplicate_in_file` is the one with no server-side equivalent elsewhere: two
 * rows claiming one SKU are invisible to a catalogue lookup, because neither is
 * stored yet.
 */
export type ImportVerdictStatus =
  | "ok"
  | "conflict"
  | "duplicate_in_file"
  | "family_conflict"
  | "invalid";

/** One problem, addressed to the COLUMN a user can see. */
export interface ImportProblem {
  field: string;
  message: string;
}

export interface ImportVerdict {
  rowNumber: number;
  sku: string;
  status: ImportVerdictStatus;
  /**
   * A row may collect problems from more than one check and all of them are
   * reported; `status` is the first non-`ok` verdict it earned.
   */
  problems: ImportProblem[];
}

/**
 * The counters a confirmation screen puts in front of the user.
 *
 * ROWS AND PRODUCTS ARE COUNTED SEPARATELY on purpose: a family of twelve rows
 * is thirteen products, and somebody reconciling an import against their
 * catalogue afterwards counts products.
 */
export interface ImportSummary {
  rows: number;
  ok: number;
  conflict: number;
  duplicateInFile: number;
  familyConflict: number;
  invalid: number;
  standaloneProducts: number;
  families: number;
  variants: number;
}

export interface ImportPreview {
  /** Null when no row carried opening stock — no warehouse was needed. */
  warehouseName: string | null;
  /**
   * The gate, stated once by the server so the client does not re-derive it
   * from the counters and get it subtly wrong.
   */
  canCommit: boolean;
  summary: ImportSummary;
  rows: ImportVerdict[];
}

/** One product or family that was created. */
export interface ImportCreated {
  kind: "standalone" | "family";
  /** Every sheet row this entry came from — a family lists all of them. */
  rowNumbers: number[];
  productId: string;
  sku: string;
  name: string;
  variantCount: number;
  /**
   * `false` is the case worth building a screen around: the product exists and
   * its stock does NOT. `createProduct` deliberately does not fail a create when
   * the ledger refuses the opening balance, and over five hundred rows that
   * distinction is invisible unless it is shown.
   *
   * `null` when the row carried no opening stock at all.
   */
  openingStockPosted: boolean | null;
  openingStockError: string | null;
}

/** One product or family whose create was refused after the analysis passed. */
export interface ImportFailed {
  kind: "standalone" | "family";
  rowNumbers: number[];
  sku: string;
  message: string;
}

export interface ImportResult {
  warehouseName: string | null;
  summary: ImportSummary & { createdCount: number; failedCount: number };
  created: ImportCreated[];
  /**
   * Non-empty means something raced this import — everything predictable was
   * refused before a single write. The remaining rows were still attempted.
   */
  failed: ImportFailed[];
}

/** The body both endpoints take. They are identical, deliberately. */
export interface ImportInput {
  /** Required only when some row carries `openingQty`. */
  warehouseId?: string;
  rows: ImportRow[];
}
