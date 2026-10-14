import { reportService } from "@/services/report.service";
import { sniffDelimiter, splitCsv } from "@/utils/csv";

import type {
  SalesReportColumn,
  SalesReportDefinition,
} from "./components/SalesReportDialog";

/**
 * THE LAPORAN › INVENTORI EXPORTS that open as a dialog — the same
 * `SalesReportDialog`, reading its Cabang and Gudang from the registers.
 */

/* ---------------------------------------------------------- Posisi stok */

/**
 * One row of the stock-on-hand export, KEYED BY ITS HEADER. The server owns
 * the column list (`EXPORT_COLUMNS` in report.controller.js) and streams it as
 * CSV; reading by name rather than by position means a column added there
 * cannot silently shift every one after it.
 */
export type StockOnHandExportRow = Record<string, string>;

/** The streamed CSV → one record per row. Trailing blank lines are dropped. */
export function stockOnHandRows(csvText: string): StockOnHandExportRow[] {
  const text = csvText.replace(/^﻿/, "");
  const [headers = [], ...lines] = splitCsv(text, sniffDelimiter(text));
  const keys = headers.map((header) => header.trim());

  return lines
    .filter((cells) => cells.some((cell) => cell.trim() !== ""))
    .map((cells) =>
      Object.fromEntries(keys.map((key, index) => [key, cells[index] ?? ""])),
    );
}

const text = (key: string) => (r: StockOnHandExportRow) => r[key] || null;
const number = (key: string) => (r: StockOnHandExportRow) =>
  r[key] === undefined || r[key] === "" ? null : Number(r[key]);

const STOCK_COLUMNS: SalesReportColumn<StockOnHandExportRow>[] = [
  {
    header: "Cabang",
    value: text("Cabang"),
    width: 18,
    about: "Cabang gudang; kosong untuk gudang bersama",
  },
  {
    header: "Gudang",
    value: text("Gudang"),
    width: 18,
    about: "Gudang tempat stok berada",
  },
  { header: "SKU", value: text("SKU"), width: 16, about: "Kode produk" },
  { header: "Produk", value: text("Produk"), width: 32, about: "Nama produk" },
  {
    header: "Kategori",
    value: text("Kategori"),
    width: 18,
    about: "Kategori produk",
  },
  { header: "Satuan", value: text("Satuan"), about: "Satuan produk" },
  {
    header: "Qty",
    value: number("Qty"),
    type: "number",
    about: "Stok saat ini di gudang itu",
  },
  {
    header: "Stok minimum",
    value: number("Stok minimum"),
    type: "number",
    about: "Batas restock; 0 berarti tidak dipantau",
  },
  {
    header: "Di bawah minimum",
    value: (r) => {
      const qty = Number(r["Qty"]);
      const min = Number(r["Stok minimum"]);
      return min > 0 && qty < min ? "Ya" : "Tidak";
    },
    about: "Ya kalau stok sudah di bawah batas restock",
  },
  {
    header: "HPP rata-rata",
    value: number("HPP rata-rata"),
    type: "number",
    width: 14,
    about:
      "Harga pokok rata-rata per satuan; kosong kalau belum ada dasar biaya",
  },
  {
    header: "Nilai persediaan",
    value: number("Nilai persediaan"),
    type: "number",
    width: 16,
    about: "Qty × HPP rata-rata",
  },
];

type StockFilter = "nonZero" | "zero";

const STOCK_FILTER_LABEL: Record<StockFilter, string> = {
  nonZero: "Stok tidak nol",
  zero: "Stok 0",
};

/**
 * Stok tiap SKU per gudang, dikelompokkan per cabang — the stock-on-hand
 * export the old Posisi stok page offered, as of now.
 */
export const stockOnHandReport: SalesReportDefinition<
  StockOnHandExportRow,
  StockFilter
> = {
  title: "Posisi stok",
  description:
    "Stok tiap SKU per gudang, dikelompokkan per cabang, termasuk nilai persediaannya. Diunduh sebagai Excel.",
  fileName: "posisi-stok",
  rowNoun: "baris stok",
  period: false,
  locations: "stock",
  note: "Posisi per saat diunduh, satu baris per produk per gudang.",
  columns: STOCK_COLUMNS,
  choice: {
    label: "Stok",
    options: (Object.keys(STOCK_FILTER_LABEL) as StockFilter[]).map(
      (value) => ({
        value,
        label: STOCK_FILTER_LABEL[value],
      }),
    ),
    defaults: ["nonZero"],
    summary: (values) =>
      values.length === 2
        ? "Semua, termasuk stok 0"
        : values.map((v) => STOCK_FILTER_LABEL[v]).join(", "),
  },
  /*
    THE STREAMED EXPORT, not the paged list: it is the whole filtered set in one
    response, chosen by the same code the list uses. Zero rows are asked for
    only when wanted, and "Stok 0" alone is the zero rows of that answer.
  */
  fetch: async ({ branchIds, warehouseIds }, filters) => {
    const includeZero = filters.includes("zero");
    const { blob } = await reportService.exportStockOnHand({
      branchIds,
      warehouseIds,
      includeZero,
    });
    const rows = stockOnHandRows(await blob.text());
    return filters.includes("nonZero")
      ? rows
      : rows.filter((row) => Number(row["Qty"]) === 0);
  },
};
