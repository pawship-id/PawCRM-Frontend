/**
 * Writing `.xlsx` — the one place in this app that produces a workbook.
 *
 * TWO SOURCES, ONE WRITER. A report has rows in memory (it fetched JSON); the
 * import template and the stock card have a CSV the server streamed. Both end up
 * here, so "what a number looks like in the file we hand people" is decided once
 * rather than per screen.
 *
 * WHY .xlsx AND NOT THE CSV WE ALREADY HAVE. A CSV carries no types, so every
 * number and date in it is text the recipient's Excel re-guesses on open — and
 * guesses differently depending on their locale. The columns below are typed, so
 * a quantity is a number the reader can sum and a date is a date they can sort.
 *
 * SheetJS arrives through a DYNAMIC IMPORT: the ~800 KB parser is fetched only
 * when somebody actually exports, and never by the screens that merely offer the
 * button. It is the CDN build pinned in package.json, not the abandoned 0.18.5
 * on npm — see features/inventory/utils/sheet.ts for why that distinction is
 * load-bearing.
 */

/** How a column's values should land in the sheet. */
export type XlsxColumnType = "text" | "number" | "date";

export interface XlsxColumn<Row> {
  /** The heading, in the language the recipient reads. */
  header: string;
  /**
   * The cell value. Returning `null` or `""` leaves the cell EMPTY rather than
   * writing a zero — the distinction the reports rely on to say "no cost basis
   * yet" instead of "worth nothing".
   */
  value: (row: Row) => string | number | null | undefined;
  /**
   * `text` is the default, and it is deliberately not `number`.
   *
   * A SKU like `007` and a barcode like `0123456789012` are digit strings, not
   * quantities: typed as numbers they lose their leading zeros, and a 13-digit
   * barcode renders as `8.9927E+12`. A column only becomes a number when
   * somebody says it is one.
   */
  type?: XlsxColumnType;
  /** Column width in characters. Defaults to the header's own length. */
  width?: number;
}

/** Excel's day zero in the 1900 date system — 1899-12-30, not the 31st. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

/**
 * `2027-08-01` → 46600.
 *
 * UTC throughout and never via a local `Date`, for the reason stated wherever
 * this codebase touches a date: a user in Jakarta and a server in UTC must not
 * disagree about which day a cell means.
 */
function toExcelSerial(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return null;

  const [, year, month, day] = match;
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day));

  return Math.round((utc - EXCEL_EPOCH_UTC) / MS_PER_DAY);
}

/** One cell, typed. Returns null when the value is genuinely absent. */
function toCell(
  raw: string | number | null | undefined,
  type: XlsxColumnType,
): { t: string; v: string | number; z?: string } | null {
  if (raw === null || raw === undefined || raw === "") return null;

  if (type === "number") {
    const numeric = typeof raw === "number" ? raw : Number(raw);
    // A value that does not parse is written as the TEXT it was rather than as
    // NaN — the recipient can see what was there and fix it, which a blank cell
    // would not let them do.
    return Number.isFinite(numeric)
      ? { t: "n", v: numeric }
      : { t: "s", v: String(raw) };
  }

  if (type === "date") {
    const serial = toExcelSerial(String(raw));
    return serial === null
      ? { t: "s", v: String(raw) }
      : { t: "n", v: serial, z: "yyyy-mm-dd" };
  }

  // Text, and explicitly formatted as such: without `@` a SKU of digits is a
  // number the moment the recipient edits the cell.
  return { t: "s", v: String(raw), z: "@" };
}

/**
 * Builds the workbook.
 *
 * `sheetName` is capped at 31 characters because Excel refuses longer ones — a
 * silent truncation here beats a file the recipient cannot open.
 */
export async function buildXlsx<Row>(
  columns: XlsxColumn<Row>[],
  rows: Row[],
  { sheetName = "Data" }: { sheetName?: string } = {},
): Promise<Blob> {
  const XLSX = await import("xlsx");

  const sheet: Record<string, unknown> = {};

  columns.forEach((column, index) => {
    sheet[XLSX.utils.encode_cell({ r: 0, c: index })] = {
      t: "s",
      v: column.header,
    };
  });

  rows.forEach((row, rowIndex) => {
    columns.forEach((column, index) => {
      const cell = toCell(column.value(row), column.type ?? "text");
      if (!cell) return;

      sheet[XLSX.utils.encode_cell({ r: rowIndex + 1, c: index })] = cell;
    });
  });

  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    // `rows.length` and not `- 1`: the header occupies row 0, so N rows end at
    // index N. An empty export is still a valid one-row sheet with its headings.
    e: { r: rows.length, c: Math.max(columns.length - 1, 0) },
  });

  sheet["!cols"] = columns.map((column) => ({
    wch: column.width ?? Math.max(12, column.header.length + 2),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));

  const buffer: ArrayBuffer = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
    // Required for the `z` formats to be written at all — without it every cell
    // lands as General and the typing above is silently discarded.
    cellStyles: true,
  });

  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Hands a blob to the browser as a download.
 *
 * The object URL is revoked immediately: the anchor click is synchronous into
 * the download manager, and one left behind pins the whole blob in memory.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Build and save in one step — what every export button actually wants. */
export async function exportToXlsx<Row>(
  columns: XlsxColumn<Row>[],
  rows: Row[],
  filename: string,
  options: { sheetName?: string } = {},
): Promise<void> {
  saveBlob(await buildXlsx(columns, rows, options), filename);
}

/**
 * Turns a CSV the SERVER streamed into a typed `.xlsx`.
 *
 * THE ROUTE THE BIG EXPORTS TAKE, and the reason they do not simply page the
 * JSON endpoint: the list APIs cap `limit` at 100, so a catalogue of six
 * thousand rows would be sixty round trips before the file could be built. The
 * export endpoints already stream the whole filtered set in one response, and
 * their row selection is the same code the screen used — so the file and the
 * screen cannot disagree about which rows exist.
 *
 * TYPES ARE MATCHED BY HEADER NAME, never by column position. The server owns
 * the column list; a column added there flows through as text and nothing
 * breaks, where a positional map would silently retype every column after it.
 * Text is the safe default for the same reason it is the default above — a SKU
 * of digits must not become a number.
 *
 * A header the map does not mention stays text. That is a DEGRADATION and not a
 * failure: the column is present and readable, just not summable, which is what
 * a rename should cost.
 */
export async function csvToXlsx(
  csvText: string,
  {
    types = {},
    sheetName = "Data",
  }: { types?: Record<string, XlsxColumnType>; sheetName?: string } = {},
): Promise<Blob> {
  // Imported here rather than at the top so a screen that merely offers the
  // button does not pull the CSV scanner into its bundle.
  const { splitCsv, sniffDelimiter } = await import("./csv");

  const text = csvText.replace(/^﻿/, "");
  const grid = splitCsv(text, sniffDelimiter(text));

  if (grid.length === 0) {
    return buildXlsx([], [], { sheetName });
  }

  const headers = grid[0].map((header) => header.trim());

  const columns: XlsxColumn<string[]>[] = headers.map((header, index) => ({
    header,
    value: (row) => row[index] ?? "",
    type: types[header] ?? "text",
  }));

  /**
   * Trailing blank lines are dropped. A CSV ends with one more often than not,
   * and an empty row at the bottom of a spreadsheet is a row the recipient's
   * SUM range quietly includes.
   */
  const rows = grid
    .slice(1)
    .filter((cells) => cells.some((cell) => cell.trim() !== ""));

  return buildXlsx(columns, rows, { sheetName });
}
