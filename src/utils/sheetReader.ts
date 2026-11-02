import type { ImportProblem } from "@/types/bulkImport";
import { splitCsv, sniffDelimiter } from "@/utils/csv";

export { splitCsv, sniffDelimiter };

/**
 * A spreadsheet the user picked, turned into rows — for ANY upload.
 *
 * THIS FILE KNOWS NOTHING ABOUT WHAT THE COLUMNS MEAN. It reads the file, finds
 * the header, numbers the rows the way Excel's gutter does and hands each one to
 * the feature's `SheetSpec`. The product import's vocabulary is in
 * `features/inventory/utils/sheet.ts`, which is also the worked example of a spec.
 *
 * A NEW UPLOAD PLUGS IN WITH THREE THINGS:
 *
 *   const { grid, sheetName } = await readGrid(file, { formats: SHEET_FORMATS });
 *   const parsed = parseGrid(grid, spec);    // spec: requiredColumns, isKnownColumn, toRow
 *   return { ...parsed, sheetName };
 *
 * and `useSheetImport` + `ImportFilePicker` + `ImportVerdictTable` for the screen.
 *
 * TWO FORMATS, ONE SET OF RULES. `.csv` is parsed here; `.xlsx` goes through
 * SheetJS. Both meet at `parseGrid`, so every decision about columns, row numbers
 * and blank cells is written once and cannot come out differently depending on
 * which button the user pressed in Excel's Save As dialog.
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

/** What every upload after the product import accepts. */
export const SHEET_FORMATS = ["xlsx", "csv"] as const;

/** `2027-08-01`. The only date shape accepted — see `readDate`. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A decimal as the API takes it: digits, optionally a point, ≤ 4 places. */
const DECIMAL = /^\d{1,16}(\.\d{1,4})?$/;

/** A file this parser cannot read, with the sentence the user is shown. */
export class SheetError extends Error {}

/** The cells of the first sheet, aligned to the user's own gutter. */
export interface SheetGrid {
  grid: string[][];
  /**
   * Which sheet of a workbook was read — and null unless there was a CHOICE.
   *
   * The first sheet is used. A tenant whose data sits on the second one gets an
   * error about missing columns, and this is the line that explains it; on a
   * one-sheet workbook, or a CSV, saying so would be noise.
   */
  sheetName: string | null;
}

/** One parsed row, plus whatever the parser itself could not accept. */
export interface ParsedRow<Row> {
  row: Row;
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
   * A spec whose row schema takes any text leaves this empty and lets the server
   * give every verdict. No business rule is ever judged here.
   */
  problems: ImportProblem[];
}

export interface ParsedGrid<Row> extends SheetGrid {
  rows: ParsedRow<Row>[];
  /**
   * Headers that matched nothing, reported rather than dropped.
   *
   * A silently-ignored column is how `hpp_awl` becomes an import with no cost
   * basis: every row passes, the products are created, and the balance sheet is
   * wrong in a way nobody looks for. Naming them costs one line of UI.
   */
  unknownColumns: string[];
}

/** What a feature tells the reader about its own sheet. */
export interface SheetSpec<Row> {
  /** Columns without which the file is not this template at all. */
  requiredColumns: readonly string[];
  /** `header` is trimmed and lowercased. */
  isKnownColumn: (header: string) => boolean;
  /**
   * The headers `toRow` receives, when lowercased is not enough — the product
   * import needs the case of its `attr_*` axis names back.
   */
  resolveHeaders?: (headers: string[], rawHeaders: string[]) => string[];
  toRow: (
    cells: string[],
    headers: string[],
    rowNumber: number,
  ) => ParsedRow<Row>;
}

/** Trimmed, lowercased, BOM-free — how a header is matched. */
function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

export function isBlank(value: string | undefined): boolean {
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
export function readDate(
  value: string,
  problems: ImportProblem[],
  column = "tgl_expired",
): string | undefined {
  if (isBlank(value)) return undefined;

  const trimmed = value.trim();
  if (ISO_DATE.test(trimmed)) return trimmed;

  problems.push({
    field: column,
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
export function readDecimal(
  value: string,
  column: string,
  problems: ImportProblem[],
): string | undefined {
  if (isBlank(value)) return undefined;

  const trimmed = value.trim();
  const decimal = normalizeDecimal(trimmed);

  if (decimal === null) {
    problems.push({
      field: column,
      message: `'${trimmed}' bukan angka yang valid — tulis angkanya saja, tanpa 'Rp' atau spasi (contoh 45000 atau 45000.50)`,
    });
    return undefined;
  }

  return decimal;
}

/**
 * The cleaning half of `readDecimal`, for a feature that leaves the verdict to
 * the server: the number as the API takes it, or null when it is not one.
 *
 * `1.250.000` and `1,250,000` are a grouped integer, never a decimal fraction:
 * both readings of `1.250` are plausible, so a SINGLE separator is left alone and
 * interpreted as a decimal point, which is what the template writes.
 */
export function normalizeDecimal(value: string): string | null {
  const trimmed = value.trim();

  const degrouped = /^\d{1,3}([.,]\d{3})+$/.test(trimmed)
    ? trimmed.replace(/[.,]/g, "")
    : trimmed.replace(",", ".");

  return DECIMAL.test(degrouped) ? degrouped : null;
}

export function readInteger(
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
 * Reads a file the user picked, whichever of the two formats it is.
 *
 * Dispatch is by EXTENSION rather than by sniffing the bytes, because the two
 * readers fail in opposite ways and the wrong one is unrecoverable: a CSV parser
 * fed a binary .xlsx produces a grid of mojibake, every header is unknown, and
 * the message the user gets is about columns rather than about the file.
 *
 * `formats` refuses anything else by name. Left out, as the product import
 * leaves it, any file that is not a workbook is read as CSV text.
 */
export async function readGrid(
  file: File,
  { formats }: { formats?: readonly string[] } = {},
): Promise<SheetGrid> {
  if (
    formats &&
    !formats.includes(file.name.split(".").pop()?.toLowerCase() ?? "")
  ) {
    throw new SheetError(
      `Format file ini belum didukung. Pakai ${formats.map((format) => `.${format}`).join(" atau ")}.`,
    );
  }

  if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
    return readWorkbook(file);
  }

  return { grid: gridFromCsv(await file.text()), sheetName: null };
}

/** The CSV path, split out so it can be tested without a `File`. */
export function gridFromCsv(text: string): string[][] {
  return splitCsv(text.replace(/^\uFEFF/, ""), sniffDelimiter(text));
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
async function readWorkbook(file: File): Promise<SheetGrid> {
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
    grid,
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
export function parseGrid<Row>(
  grid: string[][],
  spec: SheetSpec<Row>,
): ParsedGrid<Row> {
  const headerIndex = grid.findIndex((cells) =>
    cells.some((cell) => cell.trim() !== ""),
  );

  if (headerIndex === -1) {
    throw new SheetError("File-nya kosong.");
  }

  const rawHeaders = grid[headerIndex];
  const headers = rawHeaders.map(normalizeHeader);

  const resolvedHeaders = spec.resolveHeaders?.(headers, rawHeaders) ?? headers;

  const missing = spec.requiredColumns.filter(
    (column) => !headers.includes(column),
  );
  if (missing.length > 0) {
    throw new SheetError(
      `Kolom wajib tidak ditemukan: ${missing.join(", ")}. Unduh templatenya dan isi di situ.`,
    );
  }

  const unknownColumns = rawHeaders.filter((raw, index) => {
    const header = headers[index];
    return header !== "" && !spec.isKnownColumn(header);
  });

  const rows: ParsedRow<Row>[] = [];

  grid.slice(headerIndex + 1).forEach((cells, index) => {
    // A blank line is not a row. Spreadsheets end with several, and a trailing
    // empty row reported as "baris 501: sku wajib diisi" is a problem the user
    // cannot find because there is nothing on that line to look at.
    if (cells.every((cell) => cell.trim() === "")) return;

    // A grid index is 0-based and Excel's gutter is 1-based, so the row after
    // the header at index `headerIndex` is `headerIndex + index + 2`. This is
    // the number the user sees, which is the whole point of carrying it.
    rows.push(spec.toRow(cells, resolvedHeaders, headerIndex + index + 2));
  });

  if (rows.length === 0) {
    throw new SheetError("Tidak ada baris data di file ini — hanya header.");
  }

  return { grid, rows, unknownColumns, sheetName: null };
}
