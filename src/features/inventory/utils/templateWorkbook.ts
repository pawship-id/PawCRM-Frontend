import { splitCsv, sniffDelimiter } from "./sheet";

/**
 * The import template, as a formatted `.xlsx`.
 *
 * WHY THIS EXISTS AT ALL, given the server already serves a perfectly good CSV:
 * a CSV cannot carry a column format, and two of the columns here lose data
 * without one.
 *
 *   barcode      — `0123456789012` typed into a General column is a NUMBER, and
 *                  Excel drops the leading zero before anything of ours ever
 *                  sees it. Thirteen digits also render as `8.9927E+12`, which
 *                  is what the user then believes they typed. Formatted as Text,
 *                  neither happens.
 *   tgl_expired  — a real date column makes Excel store a serial number, which
 *                  is unambiguous about which half is the month. A text date in
 *                  a CSV is the one case `readDate` has to refuse outright.
 *
 * So the `.xlsx` template is not a convenience alongside the CSV — it is the one
 * that cannot silently corrupt a barcode, which is why the download menu marks it
 * "disarankan" rather than presenting the two as equivalent.
 *
 * THE SERVER REMAINS THE SOURCE OF TRUTH FOR THE COLUMNS. This builds the
 * workbook FROM the CSV the API serves, so a column added, renamed or reordered
 * there appears here with no change on this side. What this file knows is only
 * how Excel should FORMAT each column — never which columns exist.
 */

/** Stored as text, so leading zeros and long digit strings survive entry. */
const TEXT_COLUMNS = new Set([
  "parent_sku",
  "sku",
  "barcode",
  "kode_batch",
]);

/** A real date column: Excel stores a serial, and the month is never ambiguous. */
const DATE_COLUMNS = new Set(["tgl_expired"]);

/** Left numeric so a price stays a number the user can sum in their own sheet. */
const NUMBER_COLUMNS = new Set([
  "harga_jual",
  "min_stock",
  "stok_awal",
  "hpp_awal",
]);

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

/** The number format for a column, or null to leave it General. */
function formatFor(column: string): string | null {
  if (TEXT_COLUMNS.has(column) || column.startsWith("attr_")) return "@";
  if (DATE_COLUMNS.has(column)) return "yyyy-mm-dd";
  return null;
}

/**
 * Builds the workbook.
 *
 * Loaded through the same dynamic import the reader uses, so a user who only
 * ever downloads the CSV never fetches the parser.
 */
export async function csvToTemplateWorkbook(csvText: string): Promise<Blob> {
  const XLSX = await import("xlsx");

  const text = csvText.replace(/^﻿/, "");
  const grid = splitCsv(text, sniffDelimiter(text));

  if (grid.length === 0) {
    throw new Error("Template kosong");
  }

  const headers = grid[0].map((header) => header.trim().toLowerCase());
  const sheet: Record<string, unknown> = {};

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

      if (DATE_COLUMNS.has(header)) {
        const serial = toExcelSerial(value);
        sheet[address] = serial
          ? { t: "n", v: serial, z: "yyyy-mm-dd" }
          : // An example the server wrote in some other shape is left as text
            // rather than guessed at — the same rule the reader follows.
            { t: "s", v: value, z: "@" };
        return;
      }

      if (NUMBER_COLUMNS.has(header) && /^\d+(\.\d+)?$/.test(value)) {
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
  for (let row = firstEmptyRow; row < firstEmptyRow + PREFORMATTED_ROWS; row += 1) {
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
    e: { r: firstEmptyRow + PREFORMATTED_ROWS - 1, c: headers.length - 1 },
  });

  // Wide enough to read the header, which is what a user scans to work out what
  // the column wants. A default-width sheet shows "harga_j…" on every one.
  sheet["!cols"] = headers.map((header) => ({
    wch: Math.max(12, header.length + 2),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Produk");

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
