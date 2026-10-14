import { reportService } from "@/services/report.service";
import type {
  SalesBatchReportRow,
  SalesInvoiceReportRow,
  SalesItemReportRow,
} from "@/types/report";

import type {
  SalesReportColumn,
  SalesReportDefinition,
} from "./components/SalesReportDialog";

/**
 * THE LAPORAN › PENJUALAN EXPORTS, one definition each — the shared
 * `SalesReportDialog` draws the period, cabang and gudang and builds the file;
 * a definition says only what is particular to its report: its columns, its
 * one extra filter, and which endpoint fills it.
 */

/* --------------------------------------------- Penjualan per invoice */

type Status = SalesInvoiceReportRow["status"];

const STATUS_LABEL: Record<Status, string> = {
  unpaid: "Belum lunas",
  partial: "Lunas sebagian",
  paid: "Lunas",
  void: "Batal",
};

/** Every status but Batal — the server's own default, said out loud. */
const DEFAULT_STATUSES: Status[] = ["unpaid", "partial", "paid"];

const num = (value: string | null) => (value === null ? null : Number(value));

/**
 * The file's columns, in the order a faktur is read: who and when, then the
 * money top to bottom, then where it stands.
 */
const INVOICE_COLUMNS: SalesReportColumn<SalesInvoiceReportRow>[] = [
  {
    header: "No. faktur",
    value: (r) => r.invoiceNumber,
    width: 22,
    about: "Nomor faktur",
  },
  {
    header: "Tanggal faktur",
    value: (r) => r.invoiceDate,
    type: "date",
    width: 14,
    about: "Tanggal faktur diterbitkan",
  },
  {
    header: "Jatuh tempo",
    value: (r) => r.dueDate,
    type: "date",
    width: 14,
    about: "Batas pembayaran",
  },
  {
    header: "Cabang",
    value: (r) => r.branchName,
    width: 18,
    about: "Cabang penerbit",
  },
  {
    header: "Gudang",
    value: (r) => r.warehouseName,
    width: 18,
    about: "Gudang asal barang (kosong untuk faktur jasa saja)",
  },
  {
    header: "Pelanggan",
    value: (r) => r.customerName,
    width: 24,
    about: "Nama pelanggan",
  },
  {
    header: "No. HP",
    value: (r) => r.customerPhone,
    width: 16,
    about: "Nomor HP pelanggan",
  },
  {
    header: "Sumber",
    value: (r) => (r.source === "pos_bridge" ? "Kasir" : "Manual"),
    about: "Dibuat dari kasir atau manual di back office",
  },
  {
    header: "Channel",
    value: (r) => (r.channel === "marketplace" ? "Marketplace" : "Manual"),
    about: "Channel penjualan",
  },
  {
    header: "Jumlah baris",
    value: (r) => r.lineCount,
    type: "number",
    about: "Banyaknya baris produk/layanan",
  },
  {
    header: "Total qty",
    value: (r) => num(r.qtyTotal),
    type: "number",
    about: "Jumlah qty semua baris",
  },
  {
    header: "Subtotal",
    value: (r) => num(r.subtotal),
    type: "number",
    width: 14,
    about: "Qty × harga, sebelum diskon",
  },
  {
    header: "Diskon baris",
    value: (r) => num(r.itemDiscount),
    type: "number",
    width: 14,
    about: "Total diskon per baris",
  },
  {
    header: "Diskon faktur",
    value: (r) => num(r.invoiceDiscount),
    type: "number",
    width: 14,
    about: "Diskon di level faktur",
  },
  {
    header: "Biaya lain",
    value: (r) => num(r.otherCharges),
    type: "number",
    width: 14,
    about: "Ongkir, packaging, dll.",
  },
  {
    header: "DPP",
    value: (r) => num(r.dpp),
    type: "number",
    width: 14,
    about: "Dasar pengenaan pajak",
  },
  {
    header: "Tarif PPN (%)",
    value: (r) => r.taxRate,
    type: "number",
    about: "Tarif PPN saat faktur terbit",
  },
  {
    header: "PPN",
    value: (r) => num(r.tax),
    type: "number",
    width: 14,
    about: "PPN keluaran",
  },
  {
    header: "Total",
    value: (r) => num(r.total),
    type: "number",
    width: 16,
    about: "Total tagihan",
  },
  {
    header: "Dibayar",
    value: (r) => num(r.paidAmount),
    type: "number",
    width: 16,
    about: "Yang sudah dibayar",
  },
  {
    header: "Sisa tagihan",
    value: (r) => num(r.outstandingAmount),
    type: "number",
    width: 16,
    about: "Total − dibayar (0 untuk faktur batal)",
  },
  {
    header: "Status",
    value: (r) => STATUS_LABEL[r.status],
    width: 16,
    about: "Belum lunas / Lunas sebagian / Lunas / Batal",
  },
  {
    header: "Lewat jatuh tempo",
    value: (r) => (r.isOverdue ? "Ya" : "Tidak"),
    about: "Belum lunas dan sudah lewat jatuh tempo",
  },
  {
    header: "Dibuat oleh",
    value: (r) => r.createdByName,
    width: 18,
    about: "Kasir / admin yang membuat",
  },
  {
    header: "Catatan",
    value: (r) => r.notes,
    width: 30,
    about: "Catatan faktur",
  },
  {
    header: "Alasan batal",
    value: (r) => r.voidReason,
    width: 24,
    about: "Diisi hanya untuk faktur batal",
  },
];

/**
 * One row per faktur in the period: when, where, for whom, the breakdown from
 * subtotal down to PPN, and where it stands (dibayar, sisa, status).
 */
export const salesInvoiceReport: SalesReportDefinition<
  SalesInvoiceReportRow,
  Status
> = {
  title: "Penjualan per invoice",
  description:
    "Satu baris per faktur: total, diskon, pajak, dan status bayar. Diunduh sebagai Excel.",
  fileName: "penjualan-per-invoice",
  rowNoun: "faktur",
  columns: INVOICE_COLUMNS,
  choice: {
    label: "Status",
    options: (Object.keys(STATUS_LABEL) as Status[]).map((value) => ({
      value,
      label: STATUS_LABEL[value],
    })),
    defaults: DEFAULT_STATUSES,
    summary: (values) =>
      values.length === DEFAULT_STATUSES.length &&
      DEFAULT_STATUSES.every((s) => values.includes(s))
        ? "Semua kecuali batal"
        : values.length === Object.keys(STATUS_LABEL).length
          ? "Semua"
          : values.map((v) => STATUS_LABEL[v]).join(", "),
  },
  fetch: async (scope, statuses) =>
    (await reportService.salesInvoices({ ...scope, statuses })).rows,
};

/* ------------------------------------ Penjualan per produk & layanan */

type Kind = SalesItemReportRow["kind"];

const KIND_LABEL: Record<Kind, string> = {
  product: "Produk",
  service: "Layanan",
  membership: "Membership",
};

const ALL_KINDS = Object.keys(KIND_LABEL) as Kind[];

/**
 * In the order a sales sheet is read: what it is, then how much moved, then
 * what it brought in. Largest net first — the server's order.
 */
const ITEM_COLUMNS: SalesReportColumn<SalesItemReportRow>[] = [
  {
    header: "Tipe",
    value: (r) => KIND_LABEL[r.kind],
    about: "Produk, Layanan, atau Membership",
  },
  { header: "SKU", value: (r) => r.sku, width: 16, about: "Kode produk" },
  {
    header: "Nama",
    value: (r) => r.name,
    width: 32,
    about: "Nama yang terakhir tercetak di faktur (termasuk varian)",
  },
  {
    header: "Kategori",
    value: (r) => r.categoryName,
    width: 18,
    about: "Kategori di katalog",
  },
  { header: "Satuan", value: (r) => r.unit, about: "Satuan produk" },
  {
    header: "Jumlah faktur",
    value: (r) => r.invoiceCount,
    type: "number",
    about: "Berapa faktur yang memuatnya",
  },
  {
    header: "Qty terjual",
    value: (r) => num(r.qty),
    type: "number",
    about: "Total qty terjual",
  },
  {
    header: "Harga rata-rata",
    value: (r) => num(r.averagePrice),
    type: "number",
    width: 16,
    about: "Penjualan bersih ÷ qty",
  },
  {
    header: "Penjualan kotor",
    value: (r) => num(r.gross),
    type: "number",
    width: 16,
    about: "Qty × harga, sebelum diskon",
  },
  {
    header: "Diskon baris",
    value: (r) => num(r.discount),
    type: "number",
    width: 14,
    about: "Diskon yang diberikan di baris itu",
  },
  {
    header: "Penjualan bersih",
    value: (r) => num(r.net),
    type: "number",
    width: 16,
    about:
      "Kotor − diskon baris. Belum dikurangi diskon faktur, biaya lain, dan PPN.",
  },
  {
    header: "% dari total",
    value: (r) => r.share,
    type: "number",
    about: "Porsi dari total penjualan bersih periode ini",
  },
];

/**
 * Quantity and value sold per SKU or layanan — every line of the period's
 * non-cancelled faktur, kasir sales included.
 */
export const salesItemReport: SalesReportDefinition<SalesItemReportRow, Kind> =
  {
    title: "Penjualan per produk & layanan",
    description:
      "Kuantitas dan nilai penjualan per produk atau layanan. Diunduh sebagai Excel.",
    fileName: "penjualan-per-produk-layanan",
    rowNoun: "produk & layanan",
    // Nothing reads posReturns into this yet; say so where the file is made.
    note: "Retur penjualan belum mengurangi angka di laporan ini.",
    columns: ITEM_COLUMNS,
    choice: {
      label: "Tipe",
      options: ALL_KINDS.map((value) => ({ value, label: KIND_LABEL[value] })),
      defaults: ALL_KINDS,
      summary: (values) =>
        values.length === ALL_KINDS.length
          ? "Semua tipe"
          : values.map((v) => KIND_LABEL[v]).join(", "),
    },
    fetch: async (scope, kinds) =>
      (await reportService.salesItems({ ...scope, kinds })).rows,
  };

/* ------------------------------------------------------ Batch terjual */

/**
 * Who has the faktur and the phone number first, then what and which lot —
 * the order somebody reads it in when a batch is recalled.
 */
const BATCH_COLUMNS: SalesReportColumn<SalesBatchReportRow>[] = [
  {
    header: "Tanggal faktur",
    value: (r) => r.invoiceDate,
    type: "date",
    width: 14,
    about: "Tanggal faktur diterbitkan",
  },
  {
    header: "No. faktur",
    value: (r) => r.invoiceNumber,
    width: 22,
    about: "Nomor faktur",
  },
  {
    header: "Cabang",
    value: (r) => r.branchName,
    width: 18,
    about: "Cabang penerbit",
  },
  {
    header: "Gudang",
    value: (r) => r.warehouseName,
    width: 18,
    about: "Gudang asal barang",
  },
  {
    header: "Pelanggan",
    value: (r) => r.customerName,
    width: 24,
    about: "Nama pelanggan (kosong untuk pembeli umum di kasir)",
  },
  {
    header: "No. HP",
    value: (r) => r.customerPhone,
    width: 16,
    about: "Nomor HP pelanggan, untuk dihubungi saat penarikan",
  },
  {
    header: "Sumber",
    value: (r) => (r.source === "pos_bridge" ? "Kasir" : "Manual"),
    about: "Dari kasir atau faktur manual",
  },
  { header: "SKU", value: (r) => r.sku, width: 16, about: "Kode produk" },
  {
    header: "Produk",
    value: (r) => r.productName,
    width: 30,
    about: "Nama produk di katalog",
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
    about: "Kode lot dari supplier, yang dipakai saat supplier menarik produk",
  },
  {
    header: "Tgl kedaluwarsa",
    value: (r) => r.expiryDate,
    type: "date",
    width: 14,
    about: "Kosong untuk produk yang tidak kedaluwarsa",
  },
  {
    header: "Supplier",
    value: (r) => r.supplierName,
    width: 20,
    about: "Supplier batch ini (penitip, untuk barang konsinyasi)",
  },
  {
    header: "Konsinyasi",
    value: (r) => (r.isConsignment ? "Ya" : "Tidak"),
    about: "Barang titipan atau milik sendiri",
  },
  {
    header: "Qty",
    value: (r) => num(r.qty),
    type: "number",
    about: "Jumlah dari batch ini yang keluar di faktur itu",
  },
  { header: "Satuan", value: (r) => r.unit, about: "Satuan produk" },
];

/**
 * Batches and expiry dates that left through sales, for tracing back — one
 * row per faktur × produk × batch.
 */
export const salesBatchReport: SalesReportDefinition<
  SalesBatchReportRow,
  never
> = {
  title: "Batch terjual",
  description:
    "Batch dan tanggal kedaluwarsa yang keluar lewat penjualan, untuk telusur balik. Diunduh sebagai Excel.",
  fileName: "batch-terjual",
  rowNoun: "baris batch",
  note: "Hanya produk yang dicatat per batch. Retur penjualan belum mengurangi angka di laporan ini.",
  columns: BATCH_COLUMNS,
  fetch: async (scope) => (await reportService.salesBatches(scope)).rows,
};
