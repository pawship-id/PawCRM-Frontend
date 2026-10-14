import { ApiError } from "@/services/api-error";
import { productService } from "@/services/product.service";
import { reportService } from "@/services/report.service";
import type { Product } from "@/types/inventory";
import type {
  InventoryValuationReport,
  InventoryValuationRow,
  PurchaseType,
  PurchasesReportRow,
} from "@/types/report";
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

/* ----------------------------------------------------------- Stok minim */

export type LowStockRow = Product & { qtyOnHand: string };

/** The most pages one export walks — 100 rows each, the API's cap. */
const LOW_STOCK_MAX_PAGES = 50;

/**
 * Every product at or below its restock threshold, in the server's order —
 * lowest stock first. THE LIST IS PAGED (100 at most), so this walks it; a
 * restock list is a few dozen rows, and one past the cap is refused rather
 * than cut short.
 */
export async function fetchAllLowStock(query: {
  branchIds?: string[];
  warehouseIds?: string[];
}): Promise<LowStockRow[]> {
  const rows: LowStockRow[] = [];
  for (let page = 1; page <= LOW_STOCK_MAX_PAGES; page += 1) {
    const result = await productService.lowStock({
      ...query,
      page,
      limit: 100,
    });
    rows.push(...result.items);
    if (page >= result.pagination.totalPages) return rows;
  }
  // An ApiError, so the dialog's toast says this rather than a bare failure.
  throw new ApiError(
    "Terlalu banyak produk di bawah batas restock untuk satu file. Persempit cabang atau gudangnya.",
    400,
  );
}

const LOW_STOCK_COLUMNS: SalesReportColumn<LowStockRow>[] = [
  { header: "SKU", value: (r) => r.sku, width: 16, about: "Kode produk" },
  { header: "Produk", value: (r) => r.name, width: 32, about: "Nama produk" },
  { header: "Satuan", value: (r) => r.unit, about: "Satuan produk" },
  {
    header: "Stok saat ini",
    value: (r) => Number(r.qtyOnHand),
    type: "number",
    about: "Jumlah stok di cabang/gudang yang dipilih",
  },
  {
    header: "Batas minimum",
    value: (r) => Number(r.minStock),
    type: "number",
    about: "Batas restock produk",
  },
  {
    header: "Kurang",
    value: (r) => Number(r.minStock) - Number(r.qtyOnHand),
    type: "number",
    about:
      "Batas minimum − stok saat ini: berapa yang perlu diisi untuk kembali ke batas",
  },
  {
    header: "Status",
    value: (r) => (Number(r.qtyOnHand) <= 0 ? "Habis" : "Di bawah minimum"),
    width: 18,
    about: "Habis kalau stok 0 atau minus",
  },
];

/**
 * Produk yang sudah di bawah batas restock, paling mendesak di atas — the
 * same list the Stok minim page and the dashboard's alert read.
 */
export const lowStockReport: SalesReportDefinition<LowStockRow, never> = {
  title: "Stok minim",
  description:
    "Produk yang sudah di bawah batas restock, paling mendesak di atas. Diunduh sebagai Excel.",
  fileName: "stok-minim",
  rowNoun: "produk",
  period: false,
  locations: "stock",
  note: "Posisi per saat diunduh. Produk dengan batas minimum 0 tidak dipantau, jadi tidak muncul di sini.",
  columns: LOW_STOCK_COLUMNS,
  fetch: async ({ branchIds, warehouseIds }) =>
    fetchAllLowStock({ branchIds, warehouseIds }),
};

/* ------------------------------------------------------ Nilai persediaan */

/**
 * A shelf row, or — at the foot of the sheet — one line of the check against
 * the Neraca, with its words in the Produk column and its figure under Nilai.
 */
export type ValuationSheetRow = InventoryValuationRow;

const blank = {
  branchName: null,
  warehouseName: null,
  sku: null,
  categoryName: null,
  unit: null,
  qty: "",
  averageCost: "",
};

/** The shelves, then the total and its reconciliation to the Neraca. */
export function valuationRows(
  report: InventoryValuationReport,
): ValuationSheetRow[] {
  const foot = (label: string, value: string): ValuationSheetRow => ({
    ...blank,
    productName: label,
    value,
  });
  const check = report.reconciliation;

  return [
    ...report.rows,
    foot("Total nilai persediaan menurut stok", report.total),
    ...(check
      ? [
          ...check.accounts.map((account) =>
            foot(
              `Saldo akun ${account.code} ${account.name} (Neraca)`,
              account.balance,
            ),
          ),
          foot("Total saldo akun persediaan di Neraca", check.ledgerTotal),
          foot("Selisih (stok − Neraca)", check.difference),
        ]
      : []),
  ];
}

const valueOf =
  (key: "qty" | "averageCost" | "value") => (r: ValuationSheetRow) =>
    r[key] === "" ? null : Number(r[key]);

const VALUATION_COLUMNS: SalesReportColumn<ValuationSheetRow>[] = [
  {
    header: "Cabang",
    value: (r) => r.branchName,
    width: 18,
    about: "Cabang gudang; kosong untuk gudang bersama",
  },
  {
    header: "Gudang",
    value: (r) => r.warehouseName,
    width: 18,
    about: "Gudang tempat stok berada",
  },
  { header: "SKU", value: (r) => r.sku, width: 16, about: "Kode produk" },
  {
    header: "Produk",
    value: (r) => r.productName,
    width: 40,
    about:
      "Nama produk; di bagian bawah, baris total dan pencocokan dengan Neraca",
  },
  {
    header: "Kategori",
    value: (r) => r.categoryName,
    width: 18,
    about: "Kategori produk",
  },
  { header: "Satuan", value: (r) => r.unit, about: "Satuan produk" },
  {
    header: "Qty",
    value: valueOf("qty"),
    type: "number",
    about: "Stok di gudang itu pada akhir tanggal yang dipilih",
  },
  {
    header: "HPP rata-rata",
    value: valueOf("averageCost"),
    type: "number",
    width: 14,
    about:
      "Harga pokok rata-rata produk pada tanggal itu — sama untuk semua gudang",
  },
  {
    header: "Nilai persediaan",
    value: valueOf("value"),
    type: "number",
    width: 18,
    about: "Qty × HPP rata-rata",
  },
];

/**
 * Nilai stok pada satu tanggal, cocok dengan akun persediaan di Neraca — the
 * shop's own stock at the end of the chosen day, checked against the ledger.
 */
export const inventoryValuationReport: SalesReportDefinition<
  ValuationSheetRow,
  never
> = {
  title: "Nilai persediaan",
  description:
    "Nilai stok pada satu tanggal, cocok dengan akun persediaan di Neraca. Diunduh sebagai Excel.",
  fileName: "nilai-persediaan",
  rowNoun: "baris",
  period: "asOf",
  locations: "stock",
  note: "Barang konsinyasi tidak dihitung karena bukan milik toko. Pencocokan dengan Neraca hanya muncul kalau Cabang dan Gudang tidak dipilih.",
  columns: VALUATION_COLUMNS,
  fetch: async ({ asOf, branchIds, warehouseIds }) =>
    valuationRows(
      await reportService.inventoryValuation({ asOf, branchIds, warehouseIds }),
    ),
};

/* ------------------------------------------------- Pembelian per supplier */

const PURCHASE_TYPE_LABEL: Record<PurchaseType, string> = {
  beli_putus: "Beli putus",
  konsinyasi: "Konsinyasi",
};

const PURCHASE_TYPES = Object.keys(PURCHASE_TYPE_LABEL) as PurchaseType[];

const decimalOf = (value: string | null) =>
  value === null ? null : Number(value);

/** Supplier, then what, then how much came in, went back, and stayed. */
const PURCHASE_COLUMNS: SalesReportColumn<PurchasesReportRow>[] = [
  {
    header: "Supplier",
    value: (r) => r.supplierName,
    width: 24,
    about: "Supplier pengirim",
  },
  { header: "SKU", value: (r) => r.sku, width: 16, about: "Kode produk" },
  {
    header: "Produk",
    value: (r) => r.productName,
    width: 32,
    about: "Nama produk",
  },
  {
    header: "Kategori",
    value: (r) => r.categoryName,
    width: 18,
    about: "Kategori produk",
  },
  { header: "Satuan", value: (r) => r.unit, about: "Satuan produk" },
  {
    header: "Jumlah penerimaan",
    value: (r) => r.receiptCount,
    type: "number",
    about: "Berapa kali produk ini diterima dari supplier itu",
  },
  {
    header: "Penerimaan terakhir",
    value: (r) => r.lastReceiptDate,
    type: "date",
    width: 14,
    about: "Tanggal penerimaan terakhir di periode ini",
  },
  {
    header: "Qty dibeli",
    value: (r) => decimalOf(r.qty),
    type: "number",
    about: "Qty yang diterima",
  },
  {
    header: "Harga beli rata-rata",
    value: (r) => decimalOf(r.averageCost),
    type: "number",
    width: 16,
    about: "Nilai dibeli ÷ qty dibeli",
  },
  {
    header: "Nilai dibeli",
    value: (r) => decimalOf(r.amount),
    type: "number",
    width: 16,
    about: "Qty × harga beli, tanpa PPN",
  },
  {
    header: "Qty retur",
    value: (r) => decimalOf(r.returnedQty),
    type: "number",
    about: "Qty yang dikembalikan ke supplier",
  },
  {
    header: "Nilai retur",
    value: (r) => decimalOf(r.returnedAmount),
    type: "number",
    width: 14,
    about: "Nilai yang dikembalikan, tanpa PPN",
  },
  {
    header: "Qty bersih",
    value: (r) => decimalOf(r.netQty),
    type: "number",
    about: "Qty dibeli − qty retur",
  },
  {
    header: "Nilai bersih",
    value: (r) => decimalOf(r.netAmount),
    type: "number",
    width: 16,
    about: "Nilai dibeli − nilai retur",
  },
];

/**
 * Nilai dan kuantitas pembelian per supplier dan SKU — received goods less
 * returns, for the period chosen.
 */
export const purchasesReport: SalesReportDefinition<
  PurchasesReportRow,
  PurchaseType
> = {
  title: "Pembelian per supplier",
  description:
    "Nilai dan kuantitas pembelian per supplier dan SKU. Diunduh sebagai Excel.",
  fileName: "pembelian-per-supplier",
  rowNoun: "baris",
  periodLabel: "tanggal penerimaan",
  locations: "stock",
  note: "Hanya penerimaan yang sudah diterima dan retur yang sudah diajukan. Nilai tanpa PPN.",
  columns: PURCHASE_COLUMNS,
  choice: {
    label: "Jenis pembelian",
    options: PURCHASE_TYPES.map((value) => ({
      value,
      label: PURCHASE_TYPE_LABEL[value],
    })),
    // Titipan is received, not bought — on request only.
    defaults: ["beli_putus"],
    summary: (values) =>
      values.length === PURCHASE_TYPES.length
        ? "Beli putus & konsinyasi"
        : values.map((v) => PURCHASE_TYPE_LABEL[v]).join(", "),
  },
  fetch: async ({ dateFrom, dateTo, branchIds, warehouseIds }, purchaseTypes) =>
    (
      await reportService.purchases({
        dateFrom,
        dateTo,
        branchIds,
        warehouseIds,
        purchaseTypes,
      })
    ).rows,
};
