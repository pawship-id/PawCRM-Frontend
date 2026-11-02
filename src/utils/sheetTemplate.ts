/**
 * A spreadsheet template as a formatted `.xlsx`, for any upload.
 *
 * WHY A WORKBOOK AT ALL: a CSV cannot carry a column format, and a code column
 * typed into General loses its leading zeros before anything of ours sees it.
 * See `features/inventory/utils/templateWorkbook.ts`, the product template, for
 * the two columns where that loses real data.
 */

/** How a column should behave in Excel. */
export type TemplateColumnKind = "text" | "date" | "number";

export interface TemplateOptions {
  /** `column` is trimmed and lowercased. Null leaves the column General. */
  kindOf: (column: string) => TemplateColumnKind | null;
  sheetName: string;
  preformattedRows?: number;
  /**
   * Reference sheets after the main one, plain text. Nothing reads them back,
   * which is what makes one a safe home for example rows.
   */
  extraSheets?: { name: string; rows: string[][] }[];
}

/**
 * How many empty rows below the examples get their format pre-set.
 *
 * WITHOUT THESE THE FORMATTING IS DECORATION. Excel applies a column's format to
 * the cell being typed into, not to the column as a concept — so a barcode typed
 * on row 40 of an unformatted sheet is a number again, and the leading zero is
 * gone. Stub cells carry the format down the sheet, which is what makes the
 * guarantee real rather than a property of the two example rows.
 *
 * Two hundred covers an ordinary first import and costs a few KB. Past it the
 * user is pasting a block, which carries its own formatting anyway.
 */
const PREFORMATTED_ROWS = 200;

/** Excel's day zero in the 1900 date system — 1899-12-30, not the 31st. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

/** `2027-08-01` → 46600. UTC throughout, so no timezone can shift the day. */
function toExcelSerial(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;

  const [, year, month, day] = match;
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day));

  return Math.round((utc - EXCEL_EPOCH_UTC) / MS_PER_DAY);
}

const FORMATS: Record<TemplateColumnKind, string | null> = {
  text: "@",
  date: "yyyy-mm-dd",
  number: null,
};

/**
 * Builds a template workbook from a grid: the header row, then any example rows.
 *
 * A FEATURE SAYS HOW EACH COLUMN IS FORMATTED, never which columns exist: the
 * grid is the source of those, whether it came from a CSV the server serves or
 * from a list the feature keeps itself.
 *
 * Loaded through the same dynamic import the reader uses, so a user who only
 * ever downloads the CSV never fetches the parser.
 */
export async function buildTemplateWorkbook(
  grid: string[][],
  {
    kindOf,
    sheetName,
    preformattedRows = PREFORMATTED_ROWS,
    extraSheets = [],
  }: TemplateOptions,
): Promise<Blob> {
  const XLSX = await import("xlsx");

  if (grid.length === 0) {
    throw new Error("Template kosong");
  }

  const headers = grid[0].map((header) => header.trim().toLowerCase());
  const sheet: Record<string, unknown> = {};
  const formatFor = (column: string) => {
    const kind = kindOf(column);
    return kind ? FORMATS[kind] : null;
  };

  grid[0].forEach((header, column) => {
    sheet[XLSX.utils.encode_cell({ r: 0, c: column })] = {
      t: "s",
      v: header.trim(),
    };
  });

  grid.slice(1).forEach((cells, index) => {
    const row = index + 1;

    cells.forEach((raw, column) => {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const header = headers[column] ?? "";
      const value = raw.trim();
      const format = formatFor(header);

      if (value === "") {
        // A blank example cell still carries its column's format — otherwise the
        // first thing the user types into it is unformatted again.
        sheet[address] = format ? { t: "z", z: format } : { t: "z" };
        return;
      }

      if (kindOf(header) === "date") {
        const serial = toExcelSerial(value);
        sheet[address] = serial
          ? { t: "n", v: serial, z: "yyyy-mm-dd" }
          : // An example the server wrote in some other shape is left as text
            // rather than guessed at — the same rule the reader follows.
            { t: "s", v: value, z: "@" };
        return;
      }

      if (kindOf(header) === "number" && /^\d+(\.\d+)?$/.test(value)) {
        sheet[address] = { t: "n", v: Number(value) };
        return;
      }

      sheet[address] = format
        ? { t: "s", v: value, z: format }
        : { t: "s", v: value };
    });
  });

  // The stubs that carry each column's format down the sheet — see
  // PREFORMATTED_ROWS for why they are load-bearing rather than tidy.
  const firstEmptyRow = grid.length;
  for (let row = firstEmptyRow; row < firstEmptyRow + preformattedRows; row += 1) {
    headers.forEach((header, column) => {
      const format = formatFor(header);
      if (!format) return;

      sheet[XLSX.utils.encode_cell({ r: row, c: column })] = {
        t: "z",
        z: format,
      };
    });
  }

  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: firstEmptyRow + preformattedRows - 1, c: headers.length - 1 },
  });

  // Wide enough to read the header, which is what a user scans to work out what
  // the column wants. A default-width sheet shows "harga_j…" on every one.
  sheet["!cols"] = headers.map((header) => ({
    wch: Math.max(12, header.length + 2),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  extraSheets.forEach(({ name, rows }) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  });

  const buffer: ArrayBuffer = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
    // Required for the `z` formats to be written out at all — without it every
    // cell lands as General and the whole point of this file is lost.
    cellStyles: true,
  });

  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
