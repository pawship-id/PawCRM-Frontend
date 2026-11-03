import { productBulkUpdateService } from "@/services/productBulkUpdate.service";
import type {
  ProductUpdatePreview,
  ProductUpdateRow,
  ProductUpdateTemplateQuery,
  ProductUpdateVerdict,
} from "@/types/productBulkUpdate";
import { saveFile } from "@/utils/saveFile";
import {
  gridFromCsv,
  parseGrid,
  readGrid,
  SHEET_FORMATS,
  type ParsedGrid,
  type SheetSpec,
} from "@/utils/sheetReader";
import { buildTemplateWorkbook } from "@/utils/sheetTemplate";

/**
 * The bulk update's spreadsheet.
 *
 * NOT JUDGED HERE. Cells go up as the text they are, because reading a number
 * takes the stored value: `12.125` is a price or Excel's grouped 12125 depending
 * on what the product holds. See `#readNumber` in productBulkUpdate.service.js.
 *
 * A COLUMN OUTSIDE THIS LIST IS NEVER SENT. `hpp` or `stok` lands in
 * `unknownColumns`, which the screen names as ignored.
 */
export const PRODUCT_UPDATE_COLUMNS = [
  "sku",
  "nama",
  "harga_jual",
  "min_stok",
  "akun_penjualan",
  "sub_akun_penjualan",
  "merek",
  "status",
] as const;

/** Mirrors `MAX_BULK_UPDATE_ROWS`: what one preview request carries. */
export const PRODUCT_UPDATE_MAX = 500;

/**
 * Mirrors `MAX_BULK_UPDATE_COMMIT_ROWS`: changed products one Simpan may carry.
 * The writing runs in the background, so it is not bound by a request.
 */
export const PRODUCT_UPDATE_COMMIT_MAX = 20000;

const SPEC: SheetSpec<ProductUpdateRow> = {
  requiredColumns: ["sku"],
  isKnownColumn: (header) =>
    (PRODUCT_UPDATE_COLUMNS as readonly string[]).includes(header),
  toRow: (cells, headers, rowNumber) => {
    const row: ProductUpdateRow = { rowNumber };

    for (const column of PRODUCT_UPDATE_COLUMNS) {
      const value = (cells[headers.indexOf(column)] ?? "").trim();
      if (value) row[column] = value;
    }

    return { row, problems: [] };
  },
};

export async function readProductUpdateSheet(
  file: File,
): Promise<ParsedGrid<ProductUpdateRow>> {
  const { grid, sheetName } = await readGrid(file, { formats: SHEET_FORMATS });

  return { ...parseGrid(grid, SPEC), sheetName };
}

/** Rows cut to what one request carries. */
export function toBatches<T>(rows: T[], size = PRODUCT_UPDATE_MAX): T[][] {
  const batches: T[][] = [];

  for (let start = 0; start < rows.length; start += size) {
    batches.push(rows.slice(start, start + size));
  }

  return batches;
}

/**
 * The batches of one file read as one preview.
 *
 * THE SERVER SEES ONE BATCH AT A TIME, so two things only this side can see are
 * settled here: a SKU repeated across two batches, and the file's own total
 * against the 500 changed products one commit may hold. The commit re-derives
 * everything it is sent, so this can only make the button more disabled.
 */
export function mergePreviews(
  previews: ProductUpdatePreview[],
): ProductUpdatePreview {
  const rows = previews.flatMap((preview) => preview.rows);
  const bySku = new Map<string, ProductUpdateVerdict[]>();

  rows.forEach((row) => {
    if (!row.sku) return;
    bySku.set(row.sku, [...(bySku.get(row.sku) ?? []), row]);
  });

  const marked = new Map<number, ProductUpdateVerdict>();

  bySku.forEach((group) => {
    if (group.length < 2) return;

    const numbers = group.map((row) => row.rowNumber).join(", ");
    group
      .filter((row) => row.status !== "duplicate_in_file")
      .forEach((row) =>
        marked.set(row.rowNumber, {
          ...row,
          status: "duplicate_in_file",
          action: "skip",
          problems: [
            ...row.problems,
            {
              field: "sku",
              message: `SKU ini muncul lebih dari sekali (baris ${numbers}) — sisakan satu`,
            },
          ],
        }),
      );
  });

  const merged = rows.map((row) => marked.get(row.rowNumber) ?? row);
  const ok = merged.filter((row) => row.status === "ok").length;
  const changed = merged.filter((row) => row.action === "update").length;
  const problems = merged.length - ok;

  return {
    summary: {
      rows: merged.length,
      ok,
      problems,
      changed,
      unchanged: ok - changed,
    },
    canCommit:
      problems === 0 && changed > 0 && changed <= PRODUCT_UPDATE_COMMIT_MAX,
    rows: merged,
  };
}

/** Numbers stay plain text cells, so a price comes back exactly as it left. */
function kindOf(column: string) {
  if (column === "harga_jual" || column === "min_stok") return null;
  return "text" as const;
}

/**
 * The current catalogue as a file. One source, two files: the server serves CSV
 * and the workbook is built from it. No empty rows below the data: a row only
 * means something for a product that already exists.
 */
export async function saveProductUpdateTemplate(
  query: ProductUpdateTemplateQuery,
  format: "xlsx" | "csv",
): Promise<void> {
  const { blob, filename } = await productBulkUpdateService.template(query);

  if (format === "csv") {
    saveFile(blob, filename);
    return;
  }

  saveFile(
    await buildTemplateWorkbook(gridFromCsv(await blob.text()), {
      kindOf,
      sheetName: "Produk",
      preformattedRows: 0,
    }),
    filename.replace(/\.csv$/i, ".xlsx"),
  );
}
