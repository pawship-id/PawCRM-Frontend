import { stockOpnameService } from "@/services/stockOpname.service";
import type { OpnameImportRow } from "@/types/opnameImport";
import { saveFile } from "@/utils/saveFile";
import {
  normalizeDecimal,
  parseGrid,
  readGrid,
  SHEET_FORMATS,
  SheetError,
  type ParsedGrid,
  type SheetSpec,
} from "@/utils/sheetReader";
import { buildTemplateWorkbook } from "@/utils/sheetTemplate";

/**
 * The opname spreadsheet: what the server prints, and the one column a counter
 * fills in.
 *
 * NOT JUDGED HERE, as in the transfer file. Any text goes up and the API answers
 * per row. A blank `stok_fisik` stays absent, because blank means "not counted"
 * and a client that sent `0` for it would write off the shelf.
 *
 * `nama` AND `stok_sistem` ARE KNOWN AND DROPPED. They are in the file for the
 * person holding it; what the system holds is the server's to say.
 */
export const OPNAME_TEMPLATE_COLUMNS = [
  "sku",
  "nama",
  "kode_batch",
  "tgl_expired",
  "stok_sistem",
  "stok_fisik",
  "catatan",
] as const;

/** Mirrors `MAX_ITEMS` on the API's sheet. */
export const OPNAME_MAX_ITEMS = 1000;

/**
 * Mirrors `IMPORT_MAX_ROWS` on the API. A file above one sheet is split into a
 * group of sheets by a background job, so the file's bound is not the sheet's.
 */
export const OPNAME_IMPORT_MAX_ROWS = 20000;

const SHEET_NAME = "Opname";

const SPEC: SheetSpec<OpnameImportRow> = {
  requiredColumns: ["sku", "stok_fisik"],
  isKnownColumn: (header) =>
    (OPNAME_TEMPLATE_COLUMNS as readonly string[]).includes(header),
  toRow: (cells, headers, rowNumber) => {
    const row: OpnameImportRow = { rowNumber };

    const cell = (column: string) =>
      (cells[headers.indexOf(column)] ?? "").trim();

    if (cell("sku")) row.sku = cell("sku");
    if (cell("stok_fisik")) {
      row.physicalQty =
        normalizeDecimal(cell("stok_fisik")) ?? cell("stok_fisik");
    }
    if (cell("kode_batch")) row.batchCode = cell("kode_batch");
    if (cell("tgl_expired")) row.expiryDate = cell("tgl_expired");
    if (cell("catatan")) row.notes = cell("catatan");

    return { row, problems: [] };
  },
};

/** The file, or a refusal of the whole of it. */
export async function readOpnameSheet(
  file: File,
): Promise<ParsedGrid<OpnameImportRow>> {
  const { grid, sheetName } = await readGrid(file, { formats: SHEET_FORMATS });
  const parsed = parseGrid(grid, SPEC);

  if (parsed.rows.length > OPNAME_IMPORT_MAX_ROWS) {
    throw new SheetError(
      `File ini berisi ${parsed.rows.length} baris, sedangkan satu file opname maksimal ${OPNAME_IMPORT_MAX_ROWS} baris. Pecah filenya per kategori.`,
    );
  }

  return { ...parsed, sheetName };
}

function kindOf(column: string) {
  if (column === "tgl_expired") return "date" as const;
  if (column === "stok_sistem" || column === "stok_fisik") return null;
  return "text" as const;
}

/** A CSV cell, quoted only when it has to be. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The template, built from what the sheet's warehouse holds right now.
 *
 * ASKED OF THE SERVER, unlike the transfer's header-only file: the rows ARE the
 * template. The workbook is still built here, as for every upload.
 */
export async function saveOpnameTemplate(
  opnameId: string,
  format: "xlsx" | "csv",
): Promise<void> {
  const { opnameNumber, columns, rows } =
    await stockOpnameService.template(opnameId);

  const grid = [
    columns,
    ...rows.map((row) => columns.map((column) => row[column] ?? "")),
  ];
  const name = `template-opname-${opnameNumber}`;

  if (format === "csv") {
    const text = grid.map((cells) => cells.map(csvCell).join(",")).join("\r\n");
    // The BOM is what makes Excel on Windows read this as UTF-8.
    saveFile(
      new Blob([`\uFEFF${text}\r\n`], { type: "text/csv;charset=utf-8" }),
      `${name}.csv`,
    );
    return;
  }

  saveFile(
    await buildTemplateWorkbook(grid, {
      kindOf,
      sheetName: SHEET_NAME,
      preformattedRows: 50,
    }),
    `${name}.xlsx`,
  );
}
