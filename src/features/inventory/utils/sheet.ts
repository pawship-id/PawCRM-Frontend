import type { ImportProblem, ImportRow } from "@/types/productImport";
import {
  gridFromCsv,
  isBlank,
  parseGrid,
  readDate,
  readDecimal,
  readGrid,
  readInteger,
  SheetError,
  sniffDelimiter,
  splitCsv,
  type ParsedGrid,
  type ParsedRow as SheetParsedRow,
  type SheetSpec,
} from "@/utils/sheetReader";

/**
 * Re-exported so `templateWorkbook.ts` and this file's callers keep importing
 * them from here. The reader itself moved to `utils/sheetReader.ts` once a second
 * upload needed it.
 */
export { splitCsv, sniffDelimiter, SheetError };

/**
 * The spreadsheet, turned into the payload `/api/products/import` takes.
 *
 * THIS IS WHERE COLUMN NAMES STOP EXISTING. Everything above this file speaks
 * the API's field names (`sellPrice`, `openingCost`); the sheet speaks
 * `harga_jual` and `hpp_awal`. Keeping the two vocabularies apart is what lets a
 * column be renamed for legibility without touching an API payload — and it is
 * why the problems this file reports name the COLUMN, while the server's name
 * the field.
 *
 * Reading the file and finding the rows is `utils/sheetReader.ts`, shared with
 * every other upload; what is here is the `SheetSpec` for the product template.
 */

/** The API field each column maps onto, keyed by the header a sheet uses. */
const COLUMNS = {
  parent_sku: "parentSku",
  parent_nama: "parentName",
  sku: "sku",
  nama: "name",
  barcode: "barcode",
  kategori: "categoryName",
  satuan: "unit",
  harga_jual: "sellPrice",
  akun_penjualan: "salesAccountCode",
  sub_akun_penjualan: "salesSubAccountCode",
  akun_hpp: "cogsAccountCode",
  sub_akun_hpp: "cogsSubAccountCode",
  akun_persediaan: "inventoryAccountCode",
  min_stock: "minStock",
  has_expiry: "hasExpiry",
  stok_awal: "openingQty",
  hpp_awal: "openingCost",
  kode_batch_supplier: "supplierBatchCode",
  tgl_expired: "expiryDate",
} as const;

/** The prefix that marks a variable column. Stripped before it crosses the wire. */
const ATTRIBUTE_PREFIX = "attr_";

/**
 * The columns that are copied across as plain text.
 *
 * Named as a type rather than left implicit so the `default` branch of the
 * mapping switch stays type-checked: a column added to `COLUMNS` without a
 * conversion rule lands here, and if it is not a string field on `ImportRow` the
 * build fails instead of the value being silently dropped at runtime.
 */
type TextField = Extract<
  (typeof COLUMNS)[keyof typeof COLUMNS],
  | "parentSku"
  | "parentName"
  | "sku"
  | "name"
  | "barcode"
  | "categoryName"
  | "salesAccountCode"
  | "salesSubAccountCode"
  | "cogsAccountCode"
  | "cogsSubAccountCode"
  | "inventoryAccountCode"
  | "supplierBatchCode"
>;

/**
 * Columns without which the file is not this template at all.
 *
 * Only two, and neither is negotiable: a row with no `sku` names no product, and
 * a row with no `harga_jual` cannot be sold. Everything else is genuinely
 * optional in some tenant's file, and a missing optional column is silence
 * rather than an error.
 */
const REQUIRED_COLUMNS = ["sku", "harga_jual"] as const;

/** `pcs` | `sak` | `dus` — mirrored from the API, which refuses anything else. */
const UNITS = ["pcs", "sak", "dus"];

/** One parsed row, plus whatever the parser itself could not accept. */
export type ParsedRow = SheetParsedRow<ImportRow>;

export interface ParsedSheet extends ParsedGrid<ImportRow> {
  /** True when some row filled in `stok_awal` — the warehouse becomes required. */
  needsWarehouse: boolean;
}

/**
 * The unit, checked against the closed list here rather than at the API.
 *
 * Lowercased first, so "PCS" is accepted — the same courtesy the backend
 * extends. A tenant whose catalogue predates the closed list may hold "botol",
 * which is why the message names the three rather than merely refusing.
 */
function readUnit(
  value: string,
  problems: ImportProblem[],
): string | undefined {
  if (isBlank(value)) return undefined;

  const lowered = value.trim().toLowerCase();
  if (!UNITS.includes(lowered)) {
    problems.push({
      field: "satuan",
      message: `satuan '${value.trim()}' tidak dikenali — pakai salah satu dari: ${UNITS.join(", ")}`,
    });
    return undefined;
  }

  return lowered;
}

/**
 * Turns one grid row into an API row, collecting the format problems it hit.
 *
 * A BLANK CELL BECOMES AN ABSENT KEY, never an empty string. The API
 * distinguishes "not filled in" from "cleared", and an import only ever means
 * the first — sending `""` would be asserting something the sheet never said.
 */
function toRow(
  cells: string[],
  headers: string[],
  rowNumber: number,
): ParsedRow {
  const problems: ImportProblem[] = [];
  const row: ImportRow = { rowNumber };
  const attributes: Record<string, string> = {};

  headers.forEach((header, index) => {
    const raw = cells[index] ?? "";

    if (header.startsWith(ATTRIBUTE_PREFIX)) {
      // The axis name keeps the case the HEADER was written in — it becomes a
      // stored attribute name and a POS label, so `attr_Ukuran` must not arrive
      // as "ukuran". `headers` is lowercased for matching; the original is
      // recovered by the caller and passed through here already cased.
      const axis = header.slice(ATTRIBUTE_PREFIX.length).trim();
      if (axis !== "" && !isBlank(raw)) {
        attributes[axis] = raw.trim();
      }
      return;
    }

    const field = COLUMNS[header as keyof typeof COLUMNS];
    if (!field || isBlank(raw)) return;

    /**
     * Assigns only when the reader produced a value.
     *
     * A REJECTED CELL LEAVES NO KEY BEHIND. `row.expiryDate = readDate(...)`
     * looks equivalent and is not: it writes the key with `undefined`, so the
     * row carries a field it was never given. `JSON.stringify` happens to drop
     * those, which is exactly what makes the mistake survive — it is invisible
     * on the wire and visible to every `in` check, `Object.keys` and test
     * between here and there.
     */
    const set = <K extends keyof ImportRow>(
      key: K,
      value: ImportRow[K] | undefined,
    ) => {
      if (value !== undefined) row[key] = value;
    };

    switch (field) {
      case "sellPrice":
        set("sellPrice", readDecimal(raw, "harga_jual", problems));
        break;
      case "openingQty":
        set("openingQty", readDecimal(raw, "stok_awal", problems));
        break;
      case "openingCost":
        set("openingCost", readDecimal(raw, "hpp_awal", problems));
        break;
      case "minStock":
        set("minStock", readInteger(raw, "min_stock", problems));
        break;
      case "unit":
        set("unit", readUnit(raw, problems));
        break;
      case "expiryDate":
        set("expiryDate", readDate(raw, problems));
        break;
      case "hasExpiry":
        // Passed through as written. The API accepts every spelling a sheet
        // produces (`ya`/`y`/`1`/`tidak`/`0`), so translating here would only
        // add a second opinion about what "Y" means.
        row.hasExpiry = raw.trim();
        break;
      default:
        // The plain text columns. Listed rather than assigned through a computed
        // key so the compiler still checks that every one of them exists on
        // ImportRow and holds a string — a typo here would otherwise be a field
        // the server silently ignores.
        row[field satisfies TextField] = raw.trim();
    }
  });

  if (Object.keys(attributes).length > 0) {
    row.attributes = attributes;
  }

  return { row, problems };
}

const SPEC: SheetSpec<ImportRow> = {
  requiredColumns: REQUIRED_COLUMNS,
  isKnownColumn: (header) =>
    header.startsWith(ATTRIBUTE_PREFIX) || header in COLUMNS,
  // The axis name keeps the header's original case; matching is lowercased. The
  // two are reconciled here so `toRow` receives one array it can trust.
  resolveHeaders: (headers, rawHeaders) =>
    headers.map((header, index) =>
      header.startsWith(ATTRIBUTE_PREFIX)
        ? ATTRIBUTE_PREFIX +
          rawHeaders[index].trim().slice(ATTRIBUTE_PREFIX.length)
        : header,
    ),
  toRow,
};

function withWarehouseQuestion(parsed: ParsedGrid<ImportRow>): ParsedSheet {
  return {
    ...parsed,
    needsWarehouse: parsed.rows.some(
      ({ row }) => row.openingQty !== undefined,
    ),
  };
}

/** Reads a file the user picked. See `readGrid`. */
export async function readSheet(file: File): Promise<ParsedSheet> {
  const { grid, sheetName } = await readGrid(file);

  return withWarehouseQuestion({ ...parseGrid(grid, SPEC), sheetName });
}

/** The CSV path, callable without a `File`. */
export function parseSheet(text: string): ParsedSheet {
  return withWarehouseQuestion(parseGrid(gridFromCsv(text), SPEC));
}
