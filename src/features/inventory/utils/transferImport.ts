import type { TransferImportRow } from "@/types/transferImport";
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

import { TRANSFER_MAX_ITEMS } from "./transferErrors";

/**
 * The transfer spreadsheet: four columns, in the order a person fills them in.
 *
 * NOT JUDGED HERE, unlike the product template. The API takes any text in these
 * cells and answers per row, so a bad quantity is one more verdict in the same
 * table rather than a second opinion from the browser. All that happens to a cell
 * is the tidying only the browser can do: `1.250` of a grouped thousand is read
 * the way the product import reads it, and what will not read as a number goes
 * across as written, for the server to refuse by row.
 *
 * THE TEMPLATE HOLDS HEADERS ONLY, on purpose. A worked example left in the file
 * is a line of goods on a document that moves stock when saved, so it would have
 * to be a SKU that does not exist and every first upload would be refused over
 * it. The dialog says what each column wants instead.
 */
export const TRANSFER_TEMPLATE_COLUMNS = [
  "sku",
  "jumlah",
  "kode_batch",
  "catatan",
] as const;

const SHEET_NAME = "Transfer";
const FILE_NAME = "template-transfer-stok";

const SPEC: SheetSpec<TransferImportRow> = {
  requiredColumns: ["sku", "jumlah"],
  isKnownColumn: (header) =>
    (TRANSFER_TEMPLATE_COLUMNS as readonly string[]).includes(header),
  toRow: (cells, headers, rowNumber) => {
    const row: TransferImportRow = { rowNumber };

    const cell = (column: string) =>
      (cells[headers.indexOf(column)] ?? "").trim();

    if (cell("sku")) row.sku = cell("sku");
    if (cell("jumlah")) {
      row.qty = normalizeDecimal(cell("jumlah")) ?? cell("jumlah");
    }
    if (cell("kode_batch")) row.batchCode = cell("kode_batch");
    if (cell("catatan")) row.notes = cell("catatan");

    return { row, problems: [] };
  },
};

/**
 * The file, or a refusal of the whole of it.
 *
 * OVER THE LIMIT IS SAID HERE, in a sentence with the count in it, before the
 * server is asked: a document cannot hold those rows, so no verdict on them would
 * help.
 */
export async function readTransferSheet(
  file: File,
): Promise<ParsedGrid<TransferImportRow>> {
  const { grid, sheetName } = await readGrid(file, { formats: SHEET_FORMATS });
  const parsed = parseGrid(grid, SPEC);

  if (parsed.rows.length > TRANSFER_MAX_ITEMS) {
    throw new SheetError(
      `File ini berisi ${parsed.rows.length} baris, sedangkan satu transfer maksimal ${TRANSFER_MAX_ITEMS} baris. Pecah jadi dua file, lalu buat dua transfer.`,
    );
  }

  return { ...parsed, sheetName };
}

/** Text everywhere but `jumlah`: a code with a leading zero must survive Excel. */
function kindOf(column: string) {
  return column === "jumlah" ? null : ("text" as const);
}

export async function saveTransferTemplate(
  format: "xlsx" | "csv",
): Promise<void> {
  const header = TRANSFER_TEMPLATE_COLUMNS.join(",");

  if (format === "csv") {
    // The BOM is what makes Excel on Windows read this as UTF-8.
    saveFile(
      new Blob([`﻿${header}\r\n`], { type: "text/csv;charset=utf-8" }),
      `${FILE_NAME}.csv`,
    );
    return;
  }

  saveFile(
    await buildTemplateWorkbook([[...TRANSFER_TEMPLATE_COLUMNS]], {
      kindOf,
      sheetName: SHEET_NAME,
      preformattedRows: TRANSFER_MAX_ITEMS,
    }),
    `${FILE_NAME}.xlsx`,
  );
}
