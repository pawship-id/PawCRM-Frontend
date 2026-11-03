import { buildTemplateWorkbook } from "@/utils/sheetTemplate";

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
  "kode_batch_supplier",
  // Account codes are identifiers, not quantities: `4101` as a number would lose
  // a leading zero and `4101-01` is text anyway, so all five are kept as Text.
  "akun_penjualan",
  "sub_akun_penjualan",
  "akun_hpp",
  "sub_akun_hpp",
  "akun_persediaan",
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

/** The format family of a column, or null to leave it General. */
function kindOf(column: string) {
  if (TEXT_COLUMNS.has(column) || column.startsWith("attr_")) return "text";
  if (DATE_COLUMNS.has(column)) return "date";
  if (NUMBER_COLUMNS.has(column)) return "number";
  return null;
}

/** Builds the product template from the CSV the server serves. */
export async function csvToTemplateWorkbook(csvText: string): Promise<Blob> {
  const text = csvText.replace(/^\uFEFF/, "");

  return buildTemplateWorkbook(splitCsv(text, sniffDelimiter(text)), {
    kindOf,
    sheetName: "Produk",
  });
}
