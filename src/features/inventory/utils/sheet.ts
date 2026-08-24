import type { ImportProblem, ImportRow } from "@/types/productImport";
import { splitCsv, sniffDelimiter } from "@/utils/csv";

/**
 * Re-exported so `templateWorkbook.ts` keeps importing them from here — it reads
 * the server's CSV template with the same scanner this parser uses, and the two
 * must not drift into different ideas of what a quoted field is. The scanner
 * itself moved to `utils/csv.ts` once the report exports needed it too.
 */
export { splitCsv, sniffDelimiter };

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
 * TWO FORMATS, ONE SET OF RULES. `.csv` is parsed here; `.xlsx` goes through
 * SheetJS. Both meet at `parseGrid`, so every decision about columns, row
 * numbers and blank cells is written once and cannot come out differently
 * depending on which button the user pressed in Excel's Save As dialog.
 *
 * THE SHEETJS BUILD IS NOT THE ONE ON NPM, and the distinction is load-bearing
 * rather than pedantic. `xlsx` on the npm registry is an abandoned artefact
 * frozen at 0.18.5 with a live prototype-pollution advisory; the maintained line
 * moved to `cdn.sheetjs.com`, which is what package.json points at, pinned with
 * an integrity hash in the lockfile. This parser runs over a file the tenant was
 * handed by a supplier, so "just install it from npm like everything else" is a
 * one-line change that reintroduces a known hole.
 *
 * THE CSV READER IS NOT A CSV LIBRARY, deliberately — the mirror of
 * `utils/csv.js` on the backend, which says the same thing about writing. What
 * is implemented is the whole of RFC 4180 that a real spreadsheet export
 * produces: quoted fields, doubled quotes, embedded delimiters and newlines,
 * CRLF or LF, and a BOM.
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

/** `2027-08-01`. The only date shape accepted — see `readDate`. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A decimal as the API takes it: digits, optionally a point, ≤ 4 places. */
const DECIMAL = /^\d{1,16}(\.\d{1,4})?$/;

/** One parsed row, plus whatever the parser itself could not accept. */
export interface ParsedRow {
  row: ImportRow;
  /**
   * Problems found HERE, in the same shape the server's verdicts use, so the
   * preview table renders both identically.
   *
   * WHY THE CLIENT VALIDATES ANYTHING AT ALL, given the server is the authority:
   * a cell that is not a number, not a date and not a known unit would be
   * refused by the API's Joi layer as a REQUEST-level 400 — which names no row.
   * One mistyped cell in five hundred would come back as "Validation failed" and
   * send the user through the whole file by hand, which is the workflow this
   * feature exists to end.
   *
   * The duplication is bounded on purpose and worth naming: three FORMAT rules
   * (is it a number, is it YYYY-MM-DD, is it a known unit). No business rule is
   * copied — whether a SKU is taken, whether a category exists, whether a family
   * agrees with itself, all of it stays server-side, once.
   */
  problems: ImportProblem[];
}

export interface ParsedSheet {
  rows: ParsedRow[];
  /**
   * Headers that matched nothing, reported rather than dropped.
   *
   * A silently-ignored column is how `hpp_awl` becomes an import with no cost
   * basis: every row passes, the products are created, and the balance sheet is
   * wrong in a way nobody looks for. Naming them costs one line of UI.
   */
  unknownColumns: string[];
  /**
   * Which sheet of a workbook was read — and null unless there was a CHOICE.
   *
   * The first sheet is used. A tenant whose data sits on the second one gets an
   * error about missing columns, and this is the line that explains it; on a
   * one-sheet workbook, or a CSV, saying so would be noise.
   */
  sheetName: string | null;
  /** True when some row filled in `stok_awal` — the warehouse becomes required. */
  needsWarehouse: boolean;
}

/** A file this parser cannot read, with the sentence the user is shown. */
export class SheetError extends Error {}

/** Trimmed, lowercased, BOM-free — how a header is matched. */
function normalizeHeader(value: string): string {
  return value.replace(/^﻿/, "").trim().toLowerCase();
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/**
 * A date cell, accepted only as `YYYY-MM-DD`.
 *
 * NO GUESSING, and this is the one place the parser is deliberately strict where
 * being lenient would be easy. `01/08/2027` is the 1st of August in Jakarta and
 * the 8th of January in New York, and the cell it lands in decides when a batch
 * of cat food is pulled off the shelf. A parser that picks one reading is a
 * parser that will eventually pick the wrong one silently, which is precisely
 * the failure this column exists to prevent.
 *
 * So the refusal names the format AND the reason Excel produced something else,
 * because "atur format kolom jadi Teks" is the actual fix and nobody guesses it.
 *
 * THIS IS A CSV PROBLEM, NOT AN XLSX ONE. A workbook stores a date as a serial
 * number and knows which part is the month, so `cellText` renders it here already
 * canonical and this refusal never fires. CSV threw that knowledge away — which
 * is the strongest practical argument for uploading the .xlsx directly.
 */
function readDate(value: string, problems: ImportProblem[]): string | undefined {
  if (isBlank(value)) return undefined;

  const trimmed = value.trim();
  if (ISO_DATE.test(trimmed)) return trimmed;

  problems.push({
    field: "tgl_expired",
    message: `tanggal '${trimmed}' tidak dikenali — tulis sebagai YYYY-MM-DD (contoh 2027-08-01). Kalau Excel mengubahnya sendiri, atur format kolom jadi Teks lalu ketik ulang`,
  });
  return undefined;
}

/**
 * A money or quantity cell.
 *
 * A THOUSANDS SEPARATOR IS STRIPPED, and only that one. Excel exports
 * `1.250.000` or `1,250,000` depending on locale, and a user who typed a
 * perfectly good price should not be refused over punctuation their spreadsheet
 * added. What is NOT repaired is anything else: a cell holding "Rp 45.000,-" is
 * refused by name, because the alternative is inventing a price.
 */
function readDecimal(
  value: string,
  column: string,
  problems: ImportProblem[],
): string | undefined {
  if (isBlank(value)) return undefined;

  const trimmed = value.trim();

  // `1.250.000` and `1,250,000` — a grouped integer, never a decimal fraction:
  // both readings of `1.250` are plausible, so a SINGLE separator is left alone
  // and interpreted below as a decimal point, which is what the template writes.
  const degrouped = /^\d{1,3}([.,]\d{3})+$/.test(trimmed)
    ? trimmed.replace(/[.,]/g, "")
    : trimmed.replace(",", ".");

  if (!DECIMAL.test(degrouped)) {
    problems.push({
      field: column,
      message: `'${trimmed}' bukan angka yang valid — tulis angkanya saja, tanpa 'Rp' atau spasi (contoh 45000 atau 45000.50)`,
    });
    return undefined;
  }

  return degrouped;
}

function readInteger(
  value: string,
  column: string,
  problems: ImportProblem[],
): number | undefined {
  if (isBlank(value)) return undefined;

  const trimmed = value.trim().replace(/[.,]/g, "");
  if (!/^\d+$/.test(trimmed)) {
    problems.push({
      field: column,
      message: `'${value.trim()}' bukan bilangan bulat — isi angka saja, atau kosongkan`,
    });
    return undefined;
  }

  return Number(trimmed);
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

/**
 * Reads a file the user picked, whichever of the two formats it is.
 *
 * Dispatch is by EXTENSION rather than by sniffing the bytes, because the two
 * readers fail in opposite ways and the wrong one is unrecoverable: a CSV parser
 * fed a binary .xlsx produces a grid of mojibake, every header is unknown, and
 * the message the user gets is about columns rather than about the file.
 */
export async function readSheet(file: File): Promise<ParsedSheet> {
  if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
    return readWorkbook(file);
  }

  const text = await file.text();
  return parseSheet(text);
}

/**
 * The CSV path.
 *
 * Split from `readSheet` so it can be tested without a `File`, and so both
 * formats meet at `parseGrid` — every rule about columns, row numbers and cells
 * is written once and applies to whichever way the file arrived.
 */
export function parseSheet(text: string): ParsedSheet {
  return parseGrid(splitCsv(text.replace(/^﻿/, ""), sniffDelimiter(text)));
}

/**
 * One cell of a workbook, as text.
 *
 * TWO CELL TYPES NEED CARE and everything else is `String(v)`:
 *
 * DATES. Excel stores them as serial numbers — `2027-08-01` is 46600 — so a
 * date-formatted cell arrives as a number that means nothing to the row parser.
 * It is rendered with `SSF.format`, which is ARITHMETIC ON THE SERIAL and never
 * builds a `Date`. That matters more than it sounds: every route through a JS
 * Date is a route through the runtime's timezone, and a user in Jakarta entering
 * the 1st would otherwise have a fair chance of storing the 31st. It also means
 * the DD/MM ambiguity that CSV forces `readDate` to refuse simply does not
 * arise here — the workbook knows which number is the month.
 *
 * NUMBERS use the RAW value, never the displayed one. `cell.w` for a price
 * formatted as currency is "Rp45.000,00", which the decimal reader would then
 * refuse — a user rejected for formatting their own spreadsheet.
 */
function cellText(
  cell: { t?: string; v?: unknown; z?: string; w?: string } | undefined,
  ssf: { format: (fmt: string, value: number) => string; is_date: (fmt: string) => boolean },
): string {
  if (!cell || cell.v === undefined || cell.v === null) return "";

  // An error cell (#N/A, #REF!) is not a value. Treated as blank rather than
  // stringified, so it reads as "this was left empty" instead of arriving as
  // literal "#N/A" in a product name.
  if (cell.t === "e") return "";

  if (cell.t === "b") return cell.v ? "true" : "false";

  if (cell.t === "n" && typeof cell.v === "number") {
    return cell.z && ssf.is_date(cell.z)
      ? ssf.format("yyyy-mm-dd", cell.v)
      : String(cell.v);
  }

  // `cellDates` is off, so a `d` cell only appears if a workbook stored a real
  // date object. Rendered through UTC getters because that is how SheetJS built
  // it, and a local-time read would shift the day either side of midnight.
  if (cell.t === "d" && cell.v instanceof Date) {
    return cell.v.toISOString().slice(0, 10);
  }

  return String(cell.v);
}

/**
 * The `.xlsx` path.
 *
 * SheetJS is loaded through a DYNAMIC IMPORT, so the ~800 KB parser is fetched
 * only by the user who actually picked a workbook — it stays out of the bundle
 * every other screen in the app pays for.
 *
 * THE VERSION MATTERS. This is 0.20.3 from `cdn.sheetjs.com`, pinned in
 * package.json with an integrity hash in the lockfile. The `xlsx` package on the
 * npm registry is a DIFFERENT, ABANDONED artefact frozen at 0.18.5, carrying a
 * live prototype-pollution advisory — and this parser runs over a file the tenant
 * was handed by a supplier. Anyone tempted to "fix" the unusual dependency URL by
 * installing from npm would be reintroducing that.
 *
 * A FAILED CHUNK IS NOT A CRASH. If the import never resolves — an offline
 * client, a proxy that blocked the asset — the user is told to use CSV instead,
 * which is a path that needs nothing but the code already running.
 */
async function readWorkbook(file: File): Promise<ParsedSheet> {
  let XLSX: typeof import("xlsx");
  try {
    XLSX = await import("xlsx");
  } catch {
    throw new SheetError(
      "Pembaca file Excel gagal dimuat. Coba muat ulang halaman, atau simpan filenya sebagai CSV UTF-8 lalu unggah ulang.",
    );
  }

  const buffer = await file.arrayBuffer();

  let workbook: import("xlsx").WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      // Serial numbers are kept as numbers and converted by `cellText` through
      // SSF — see there for why a Date is the thing to avoid.
      cellDates: false,
      // The number format per cell, which is the ONLY way to tell a date from an
      // ordinary number once both are serials.
      cellNF: true,
      // Display text is not read; `cellText` uses raw values. Off because it is
      // a per-cell string the parser never looks at.
      cellText: false,
    });
  } catch {
    /**
     * NOT THE GUARD IT LOOKS LIKE. SheetJS is lenient to a fault: handed bytes
     * that are not a workbook at all it returns a sheet made of nonsense rather
     * than throwing, so an ordinary wrong-file upload does NOT arrive here — it
     * reaches `parseGrid` and is refused for its missing columns, which is the
     * more useful message anyway.
     *
     * What does land here is the narrower class SheetJS genuinely refuses:
     * encrypted workbooks and structurally broken containers. Kept for those, and
     * so that a future version which decides to be strict has somewhere to go.
     */
    throw new SheetError(
      "File Excel-nya tidak bisa dibaca — mungkin rusak atau diproteksi password.",
    );
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;

  if (!sheet || !sheet["!ref"]) {
    throw new SheetError("Sheet pertama di file ini kosong.");
  }

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const grid: string[][] = [];

  /**
   * Read from row 0 and column 0, NOT from the sheet's own start.
   *
   * A workbook whose used range begins at A3 — two blank rows the user left at
   * the top — would otherwise produce a grid whose first entry is Excel's row 3,
   * and every row number this feature reports would be off by two. The row number
   * is the one thing the user navigates by, so the grid is aligned to the sheet's
   * gutter and `parseGrid` finds the header wherever it actually sits.
   */
  for (let r = 0; r <= range.e.r; r += 1) {
    const cells: string[] = [];
    for (let c = 0; c <= range.e.c; c += 1) {
      cells.push(
        cellText(
          sheet[XLSX.utils.encode_cell({ r, c })],
          XLSX.SSF as Parameters<typeof cellText>[1],
        ),
      );
    }
    grid.push(cells);
  }

  return {
    ...parseGrid(grid),
    // Named only when there is a choice to be surprised by — a one-sheet
    // workbook telling the user which sheet was read is noise.
    sheetName: workbook.SheetNames.length > 1 ? sheetName : null,
  };
}

/**
 * Everything both formats share: find the header, check the columns, number the
 * rows the way the user's own gutter does.
 *
 * THE HEADER IS FOUND, NOT ASSUMED TO BE FIRST. A file with a blank line or two
 * above the header is ordinary — a CSV pasted together by hand, a workbook with
 * breathing room at the top — and treating row 1 as the header there produces
 * "kolom sku tidak ditemukan" about a sheet where `sku` is plainly visible.
 */
function parseGrid(grid: string[][]): ParsedSheet {
  const headerIndex = grid.findIndex((cells) =>
    cells.some((cell) => cell.trim() !== ""),
  );

  if (headerIndex === -1) {
    throw new SheetError("File-nya kosong.");
  }

  const rawHeaders = grid[headerIndex];
  const headers = rawHeaders.map(normalizeHeader);

  // The axis name keeps the header's original case; matching is lowercased. The
  // two are reconciled here so `toRow` receives one array it can trust.
  const resolvedHeaders = headers.map((header, index) =>
    header.startsWith(ATTRIBUTE_PREFIX)
      ? ATTRIBUTE_PREFIX +
        rawHeaders[index].trim().slice(ATTRIBUTE_PREFIX.length)
      : header,
  );

  const missing = REQUIRED_COLUMNS.filter(
    (column) => !headers.includes(column),
  );
  if (missing.length > 0) {
    throw new SheetError(
      `Kolom wajib tidak ditemukan: ${missing.join(", ")}. Unduh templatenya dan isi di situ.`,
    );
  }

  const unknownColumns = rawHeaders.filter((raw, index) => {
    const header = headers[index];
    if (header === "") return false;
    return !header.startsWith(ATTRIBUTE_PREFIX) && !(header in COLUMNS);
  });

  const rows: ParsedRow[] = [];

  grid.slice(headerIndex + 1).forEach((cells, index) => {
    // A blank line is not a row. Spreadsheets end with several, and a trailing
    // empty row reported as "baris 501: sku wajib diisi" is a problem the user
    // cannot find because there is nothing on that line to look at.
    if (cells.every((cell) => cell.trim() === "")) return;

    // A grid index is 0-based and Excel's gutter is 1-based, so the row after
    // the header at index `headerIndex` is `headerIndex + index + 2`. This is
    // the number the user sees, which is the whole point of carrying it.
    rows.push(toRow(cells, resolvedHeaders, headerIndex + index + 2));
  });

  if (rows.length === 0) {
    throw new SheetError("Tidak ada baris data di file ini — hanya header.");
  }

  return {
    rows,
    unknownColumns,
    sheetName: null,
    needsWarehouse: rows.some(({ row }) => row.openingQty !== undefined),
  };
}
