import { ApiError } from "@/services/api-error";
import { productService } from "@/services/product.service";
import { reportService } from "@/services/report.service";
import type { Product } from "@/types/inventory";
import type {
  ConsignmentOnHandRow,
  OpnameDifferenceRow,
  TransferReportRow,
  TransferStatus,
  BatchExpiryReportRow,
  ExpiryStatus,
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

/* ------------------------------------------------- Batch & kedaluwarsa */

const EXPIRY_STATUS_LABEL: Record<ExpiryStatus, string> = {
  expired: "Sudah kedaluwarsa",
  within30: "≤ 30 hari",
  within90: "31–90 hari",
  within180: "91–180 hari",
  later: "> 180 hari",
  noExpiry: "Tanpa tanggal kedaluwarsa",
};

const EXPIRY_STATUSES = Object.keys(EXPIRY_STATUS_LABEL) as ExpiryStatus[];

/** Where the lot is, which lot, how long it has, and what it is worth. */
const EXPIRY_COLUMNS: SalesReportColumn<BatchExpiryReportRow>[] = [
  {
    header: "Cabang",
    value: (r) => r.branchName,
    width: 16,
    about: "Cabang gudang; kosong untuk gudang bersama",
  },
  {
    header: "Gudang",
    value: (r) => r.warehouseName,
    width: 18,
    about: "Gudang tempat batch berada",
  },
  { header: "SKU", value: (r) => r.sku, width: 16, about: "Kode produk" },
  {
    header: "Produk",
    value: (r) => r.productName,
    width: 30,
    about: "Nama produk",
  },
  {
    header: "Kode batch",
    value: (r) => r.batchCode,
    width: 18,
    about: "Kode batch di sistem",
  },
  {
    header: "Kode batch supplier",
    value: (r) => r.supplierBatchCode,
    width: 18,
    about: "Kode lot dari supplier",
  },
  {
    header: "Tanggal masuk",
    value: (r) => r.receivedDate,
    type: "date",
    width: 14,
    about: "Tanggal batch masuk ke gudang",
  },
  {
    header: "Tgl kedaluwarsa",
    value: (r) => r.expiryDate,
    type: "date",
    width: 14,
    about: "Kosong untuk produk yang tidak kedaluwarsa",
  },
  {
    header: "Sisa umur (hari)",
    value: (r) => r.daysLeft,
    type: "number",
    about: "Hari sampai kedaluwarsa, per hari ini. Minus = sudah lewat",
  },
  {
    header: "Status umur",
    value: (r) => EXPIRY_STATUS_LABEL[r.status],
    width: 20,
    about: "Kelompok sisa umur simpan",
  },
  {
    header: "Konsinyasi",
    value: (r) => (r.isConsignment ? "Ya" : "Tidak"),
    about: "Barang titipan supplier",
  },
  {
    header: "Qty sisa",
    value: (r) => Number(r.qtyRemaining),
    type: "number",
    about: "Stok yang masih ada di batch ini",
  },
  { header: "Satuan", value: (r) => r.unit, about: "Satuan produk" },
  {
    header: "Harga pokok",
    value: (r) => Number(r.unitCost),
    type: "number",
    width: 14,
    about: "HPP rata-rata produk; untuk konsinyasi, harga setor ke supplier",
  },
  {
    header: "Nilai sisa",
    value: (r) => Number(r.value),
    type: "number",
    width: 16,
    about: "Qty sisa × harga pokok",
  },
  {
    header: "Risiko kerugian",
    value: (r) => (r.riskValue === null ? null : Number(r.riskValue)),
    type: "number",
    width: 16,
    about:
      "Nilai sisa batch milik toko yang sudah atau akan kedaluwarsa dalam 90 hari",
  },
];

/**
 * Sisa umur simpan per batch dan risiko kerugian — every lot still holding
 * stock, as of today.
 */
export const batchExpiryReport: SalesReportDefinition<
  BatchExpiryReportRow,
  ExpiryStatus
> = {
  title: "Batch & kedaluwarsa",
  description:
    "Sisa umur simpan per batch dan risiko kerugian. Diunduh sebagai Excel.",
  fileName: "batch-kedaluwarsa",
  rowNoun: "batch",
  period: false,
  locations: "stock",
  note: "Posisi per hari ini, hanya batch yang masih ada stoknya. Risiko kerugian = nilai batch milik toko yang sudah atau akan kedaluwarsa dalam 90 hari; barang konsinyasi tidak dihitung.",
  columns: EXPIRY_COLUMNS,
  choice: {
    label: "Status umur",
    options: EXPIRY_STATUSES.map((value) => ({
      value,
      label: EXPIRY_STATUS_LABEL[value],
    })),
    defaults: EXPIRY_STATUSES,
    summary: (values) =>
      values.length === EXPIRY_STATUSES.length
        ? "Semua"
        : values.map((v) => EXPIRY_STATUS_LABEL[v]).join(", "),
  },
  fetch: async ({ branchIds, warehouseIds }, statuses) =>
    (await reportService.batchExpiry({ branchIds, warehouseIds })).rows.filter(
      (row) => statuses.includes(row.status),
    ),
};

/* ------------------------------------------------------- Selisih opname */

const DIRECTION_LABEL: Record<OpnameDifferenceRow["direction"], string> = {
  short: "Kurang",
  over: "Lebih",
  match: "Sesuai",
};

type OpnameLines = "diff" | "match";

const OPNAME_LINES_LABEL: Record<OpnameLines, string> = {
  diff: "Ada selisih",
  match: "Tanpa selisih",
};

/** Which count, which product, what was found, and what it posted. */
const OPNAME_COLUMNS: SalesReportColumn<OpnameDifferenceRow>[] = [
  {
    header: "No. opname",
    value: (r) => r.opnameNumber,
    width: 18,
    about: "Nomor stok opname",
  },
  {
    header: "Tanggal opname",
    value: (r) => r.opnameDate,
    type: "date",
    width: 14,
    about: "Tanggal hitung stok",
  },
  {
    header: "Cabang",
    value: (r) => r.branchName,
    width: 16,
    about: "Cabang opname",
  },
  {
    header: "Gudang",
    value: (r) => r.warehouseName,
    width: 18,
    about: "Gudang yang dihitung",
  },
  {
    header: "Diajukan oleh",
    value: (r) => r.submittedByName,
    width: 18,
    about: "Yang mengajukan hasil opname",
  },
  { header: "SKU", value: (r) => r.sku, width: 16, about: "Kode produk" },
  {
    header: "Produk",
    value: (r) => r.productName,
    width: 30,
    about: "Nama produk",
  },
  {
    header: "Kode batch",
    value: (r) => r.batchCode,
    width: 18,
    about: "Batch yang dihitung, kalau produknya per batch",
  },
  { header: "Satuan", value: (r) => r.unit, about: "Satuan produk" },
  {
    header: "Qty sistem",
    value: (r) => Number(r.systemQty),
    type: "number",
    about: "Stok menurut sistem saat opname",
  },
  {
    header: "Qty fisik",
    value: (r) => Number(r.physicalQty),
    type: "number",
    about: "Stok yang ditemukan di rak",
  },
  {
    header: "Selisih qty",
    value: (r) => Number(r.diffQty),
    type: "number",
    about: "Qty fisik − qty sistem. Minus = kurang",
  },
  {
    header: "Kurang / lebih",
    value: (r) => DIRECTION_LABEL[r.direction],
    about: "Kurang, Lebih, atau Sesuai",
  },
  {
    header: "HPP",
    value: (r) => Number(r.unitCost),
    type: "number",
    width: 14,
    about: "HPP rata-rata saat opname diajukan",
  },
  {
    header: "Nilai selisih",
    value: (r) => Number(r.diffValue),
    type: "number",
    width: 16,
    about: "Selisih qty × HPP — yang masuk ke jurnal",
  },
  {
    header: "Catatan baris",
    value: (r) => r.lineNotes,
    width: 24,
    about: "Catatan di baris hitung",
  },
  {
    header: "Catatan opname",
    value: (r) => r.sheetNotes,
    width: 24,
    about: "Catatan opname",
  },
  {
    header: "Total selisih opname",
    value: (r) => Number(r.sheetDiffValue),
    type: "number",
    width: 18,
    about: "Nilai selisih seluruh opname — jumlah yang diposting ke jurnal",
  },
  {
    header: "No. jurnal",
    value: (r) => r.entryNumber,
    width: 18,
    about: "Jurnal yang terbentuk dari opname ini",
  },
  {
    header: "Akun jurnal",
    value: (r) => r.posting,
    width: 44,
    about: "Akun debit (Dr) dan kredit (Cr) di jurnal itu",
  },
];

/**
 * Riwayat penyesuaian hasil hitung stok, dan jurnal yang terbentuk — every
 * counted line of the period's submitted opname.
 */
export const opnameDifferenceReport: SalesReportDefinition<
  OpnameDifferenceRow,
  OpnameLines
> = {
  title: "Selisih opname",
  description:
    "Riwayat penyesuaian hasil hitung stok, dan jurnal yang terbentuk. Diunduh sebagai Excel.",
  fileName: "selisih-opname",
  rowNoun: "baris",
  periodLabel: "tanggal opname",
  locations: "stock",
  note: "Hanya opname yang sudah diajukan. Satu opname membentuk satu jurnal, jadi No. jurnal dan Total selisih opname sama untuk semua barisnya.",
  columns: OPNAME_COLUMNS,
  choice: {
    label: "Baris",
    options: (Object.keys(OPNAME_LINES_LABEL) as OpnameLines[]).map(
      (value) => ({
        value,
        label: OPNAME_LINES_LABEL[value],
      }),
    ),
    defaults: ["diff"],
    summary: (values) =>
      values.length === 2
        ? "Semua baris"
        : values.map((v) => OPNAME_LINES_LABEL[v]).join(", "),
  },
  fetch: async ({ dateFrom, dateTo, branchIds, warehouseIds }, lines) => {
    const { rows } = await reportService.opnameDifferences({
      dateFrom,
      dateTo,
      branchIds,
      warehouseIds,
      onlyDifferences: !lines.includes("match"),
    });
    return lines.includes("diff")
      ? rows
      : rows.filter((row) => row.direction === "match");
  },
};

/* ------------------------------------------------ Transfer antar gudang */

/* The Transfer Stok screen's words for the three states. */
const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  in_transit: "Belum diterima",
  received: "Diterima",
  cancelled: "Dibatalkan",
};

const TRANSFER_STATUSES = Object.keys(
  TRANSFER_STATUS_LABEL,
) as TransferStatus[];

/** Which transfer, from where to where, what and how much, and its fate. */
const TRANSFER_COLUMNS: SalesReportColumn<TransferReportRow>[] = [
  {
    header: "No. transfer",
    value: (r) => r.transferNumber,
    width: 18,
    about: "Nomor transfer (surat jalan)",
  },
  {
    header: "Tanggal kirim",
    value: (r) => r.transferDate,
    type: "date",
    width: 14,
    about: "Tanggal barang dikirim",
  },
  {
    header: "Status",
    value: (r) => TRANSFER_STATUS_LABEL[r.status],
    width: 14,
    about: "Belum diterima, Diterima, atau Dibatalkan",
  },
  {
    header: "Cabang asal",
    value: (r) => r.fromBranchName,
    width: 16,
    about: "Kosong untuk gudang bersama",
  },
  {
    header: "Gudang asal",
    value: (r) => r.fromWarehouseName,
    width: 18,
    about: "Gudang pengirim",
  },
  {
    header: "Cabang tujuan",
    value: (r) => r.toBranchName,
    width: 16,
    about: "Kosong untuk gudang bersama",
  },
  {
    header: "Gudang tujuan",
    value: (r) => r.toWarehouseName,
    width: 18,
    about: "Gudang penerima",
  },
  {
    header: "Antar cabang",
    value: (r) => (r.crossBranch ? "Ya" : "Tidak"),
    about: "Ya kalau gudang asal dan tujuan ada di cabang yang berbeda",
  },
  { header: "SKU", value: (r) => r.sku, width: 16, about: "Kode produk" },
  {
    header: "Produk",
    value: (r) => r.productName,
    width: 30,
    about: "Nama produk",
  },
  {
    header: "Kode batch",
    value: (r) => r.batchCode,
    width: 18,
    about: "Batch yang benar-benar dipindahkan (hasil FEFO atau pilihan)",
  },
  {
    header: "Tgl kedaluwarsa",
    value: (r) => r.expiryDate,
    type: "date",
    width: 14,
    about: "Kedaluwarsa batch itu",
  },
  {
    header: "Qty",
    value: (r) => Number(r.qty),
    type: "number",
    about: "Qty yang dipindahkan",
  },
  { header: "Satuan", value: (r) => r.unit, about: "Satuan produk" },
  {
    header: "Nilai",
    value: (r) => Number(r.value),
    type: "number",
    width: 16,
    about:
      "Qty × HPP saat dikirim — informasi, bukan jurnal: nilai persediaan tidak berubah",
  },
  {
    header: "Tanggal diterima",
    value: (r) => r.receivedDate,
    type: "date",
    width: 14,
    about: "Kosong kalau belum diterima",
  },
  {
    header: "Tanggal dibatalkan",
    value: (r) => r.cancelledDate,
    type: "date",
    width: 14,
    about: "Diisi hanya untuk transfer yang dibatalkan",
  },
  {
    header: "Revisi",
    value: (r) => r.revision,
    type: "number",
    about: "Berapa kali transfer diubah sebelum diterima",
  },
  {
    header: "Dibuat oleh",
    value: (r) => r.createdByName,
    width: 18,
    about: "Yang membuat transfer",
  },
  {
    header: "Diterima oleh",
    value: (r) => r.receivedByName,
    width: 18,
    about: "Yang menerima di gudang tujuan",
  },
  {
    header: "Catatan",
    value: (r) => r.notes,
    width: 28,
    about: "Catatan transfer",
  },
];

/**
 * Perpindahan stok antar gudang dan cabang — every transfer sent in the
 * period, lot by lot.
 */
export const transferReport: SalesReportDefinition<
  TransferReportRow,
  TransferStatus
> = {
  title: "Transfer antar gudang",
  description:
    "Perpindahan stok antar gudang dan cabang. Diunduh sebagai Excel.",
  fileName: "transfer-antar-gudang",
  rowNoun: "baris",
  periodLabel: "tanggal kirim",
  locations: "stock",
  note: "Filter Gudang mencocokkan gudang asal maupun tujuan. Qty dan batch diambil dari yang benar-benar dipindahkan, versi terakhir kalau transfernya pernah diubah.",
  columns: TRANSFER_COLUMNS,
  choice: {
    label: "Status",
    options: TRANSFER_STATUSES.map((value) => ({
      value,
      label: TRANSFER_STATUS_LABEL[value],
    })),
    defaults: TRANSFER_STATUSES,
    summary: (values) =>
      values.length === TRANSFER_STATUSES.length
        ? "Semua status"
        : values.map((v) => TRANSFER_STATUS_LABEL[v]).join(", "),
  },
  fetch: async ({ dateFrom, dateTo, branchIds, warehouseIds }, statuses) =>
    (
      await reportService.transfers({
        dateFrom,
        dateTo,
        branchIds,
        warehouseIds,
        statuses,
      })
    ).rows,
};

/* ----------------------------------------------- Konsinyasi outstanding */

/** Whose goods, where they sit, how much, and how long they have sat. */
const CONSIGNMENT_ON_HAND_COLUMNS: SalesReportColumn<ConsignmentOnHandRow>[] = [
  {
    header: "Supplier",
    value: (r) => r.supplierName,
    width: 24,
    about: "Penitip barang",
  },
  {
    header: "Cabang",
    value: (r) => r.branchName,
    width: 16,
    about: "Cabang gudang; kosong untuk gudang bersama",
  },
  {
    header: "Gudang",
    value: (r) => r.warehouseName,
    width: 18,
    about: "Gudang tempat titipan berada",
  },
  { header: "SKU", value: (r) => r.sku, width: 16, about: "Kode produk" },
  {
    header: "Produk",
    value: (r) => r.productName,
    width: 30,
    about: "Nama produk titipan",
  },
  { header: "Satuan", value: (r) => r.unit, about: "Satuan produk" },
  {
    header: "Jumlah lot",
    value: (r) => r.lotCount,
    type: "number",
    about: "Berapa lot titipan yang masih ada stoknya",
  },
  {
    header: "Qty sisa",
    value: (r) => Number(r.qty),
    type: "number",
    about: "Titipan yang masih di gudang",
  },
  {
    header: "Harga setor",
    value: (r) => (r.unitCost === null ? null : Number(r.unitCost)),
    type: "number",
    width: 14,
    about: "Harga dari supplier per satuan (rata-rata lot yang tersisa)",
  },
  {
    header: "Nilai titipan",
    value: (r) => Number(r.value),
    type: "number",
    width: 16,
    about:
      "Qty sisa × harga setor — belum utang; jadi utang hanya kalau terjual",
  },
  {
    header: "Masuk paling lama",
    value: (r) => r.oldestReceivedDate,
    type: "date",
    width: 14,
    about: "Tanggal lot tertua yang masih ada masuk",
  },
  {
    header: "Lama dititip (hari)",
    value: (r) => r.daysHeld,
    type: "number",
    about: "Hari sejak lot tertua masuk, per hari ini",
  },
  {
    header: "Kedaluwarsa terdekat",
    value: (r) => r.nearestExpiry,
    type: "date",
    width: 14,
    about: "Kosong untuk produk yang tidak kedaluwarsa",
  },
];

/**
 * Barang titipan yang masih di gudang, per supplier — not a debt: the debt
 * appears only as the goods sell.
 */
export const consignmentOnHandReport: SalesReportDefinition<
  ConsignmentOnHandRow,
  never
> = {
  title: "Konsinyasi outstanding",
  description:
    "Barang titipan yang masih di gudang, per supplier. Belum jadi utang — utang muncul saat barangnya laku. Diunduh sebagai Excel.",
  fileName: "konsinyasi-outstanding",
  rowNoun: "baris",
  period: false,
  locations: "stock",
  note: "Posisi per hari ini. Nilai titipan bukan utang; utang konsinyasi ada di laporan Penjualan konsinyasi dan layar Konsinyasi.",
  columns: CONSIGNMENT_ON_HAND_COLUMNS,
  fetch: async ({ branchIds, warehouseIds }) =>
    (await reportService.consignmentOnHand({ branchIds, warehouseIds })).rows,
};
