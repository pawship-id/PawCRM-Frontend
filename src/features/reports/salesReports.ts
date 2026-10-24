import { reportService } from "@/services/report.service";
import type {
  ConsignmentSalesReportRow,
  PosSalesReportRow,
  SalesBatchReportRow,
  SalesInvoiceReportLine,
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

const METHOD_LABEL: Record<string, string> = {
  cash: "Tunai",
  transfer: "Transfer",
  qris: "QRIS",
  edc: "EDC",
  giro: "Giro",
};

const SOURCE_LABEL = (r: SalesInvoiceReportRow) =>
  r.channel === "marketplace"
    ? "Marketplace"
    : r.source === "pos_bridge"
      ? "Kasir"
      : "Manual";

/** A list cell: the names joined, or empty when there are none. */
const joined = (values: string[]) => (values.length ? values.join(", ") : null);

/**
 * The file's columns, in the order BO asked for (22 Oktober 2026): which
 * faktur and where from, who bought, the money top to bottom, how it was paid,
 * then whose goods and what was noted.
 */
const INVOICE_COLUMNS: SalesReportColumn<SalesInvoiceReportRow>[] = [
  {
    header: "Tanggal faktur",
    value: (r) => r.invoiceDate,
    type: "date",
    width: 14,
    about: "Tanggal faktur diterbitkan",
  },
  {
    header: "REF",
    value: (r) => r.reference,
    width: 20,
    about: "Nomor transaksi kasir (POS-…), atau nomor pesanan e-commerce",
  },
  {
    header: "No. faktur",
    value: (r) => r.invoiceNumber,
    width: 22,
    about: "Nomor faktur",
  },
  {
    header: "Sumber",
    value: SOURCE_LABEL,
    about: "Kasir, Manual (faktur back office), atau marketplace",
  },
  {
    header: "Nama toko",
    value: (r) => r.storeName,
    width: 18,
    about: "Cabang untuk kasir dan faktur manual; nama toko untuk e-commerce",
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
    about:
      'Nama pelanggan ("Pelanggan umum" untuk pembeli tanpa data di kasir)',
  },
  {
    header: "No. HP",
    value: (r) => r.customerPhone,
    width: 16,
    about: "Nomor HP pelanggan",
  },
  {
    header: "Tipe pelanggan",
    value: (r) => r.customerTypeName,
    width: 16,
    about: "Tipe pelanggan dari Pengaturan › Tipe pelanggan",
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
    header: "Kurir",
    value: (r) => r.courierName,
    width: 14,
    about:
      "Umum untuk kasir dan faktur manual; nama ekspedisi untuk e-commerce",
  },
  {
    header: "Status",
    value: (r) => STATUS_LABEL[r.status],
    width: 16,
    about: "Belum lunas / Lunas sebagian / Lunas / Batal",
  },
  {
    header: "Diskon baris",
    value: (r) => num(r.itemDiscount),
    type: "number",
    width: 14,
    about: "Total diskon per baris (kasir dan faktur manual)",
  },
  {
    header: "Diskon faktur",
    value: (r) => num(r.invoiceDiscount),
    type: "number",
    width: 14,
    about: "Diskon di level faktur (kasir dan faktur manual)",
  },
  {
    header: "Diskon lainnya",
    value: (r) => num(r.otherDiscount),
    type: "number",
    width: 14,
    about: "Diskon dari e-commerce",
  },
  {
    header: "Biaya lain",
    value: (r) => num(r.otherCharges),
    type: "number",
    width: 14,
    about: "Total biaya lain",
  },
  {
    header: "Nama biaya lain",
    value: (r) => joined(r.otherChargeLabels),
    width: 24,
    about: "Nama setiap biaya lain, misal Ongkir, Packaging",
  },
  {
    header: "Tarif PPN (%)",
    value: (r) => r.taxRate,
    type: "number",
    about: "Tarif PPN saat faktur terbit (kasir: PPN ÷ DPP)",
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
    value: (r) => num(r.netTotal),
    type: "number",
    width: 16,
    about:
      "Subtotal − diskon baris − diskon faktur + biaya lain, sebelum PPN ditambahkan",
  },
  {
    header: "Grand total",
    value: (r) => num(r.total),
    type: "number",
    width: 16,
    about: "Total tagihan, termasuk PPN",
  },
  {
    header: "Akun bayar",
    value: (r) =>
      r.channel === "marketplace" ? null : joined(r.paymentAccountNames),
    width: 22,
    about: "Akun/channel tempat uang masuk (kasir dan faktur manual)",
  },
  {
    header: "Metode bayar",
    value: (r) => joined(r.paymentMethods.map((m) => METHOD_LABEL[m] ?? m)),
    width: 16,
    about: "Tunai / Transfer / QRIS / EDC",
  },
  {
    header: "Nama kasir",
    value: (r) => (r.channel === "marketplace" ? null : r.cashierName),
    width: 18,
    about: "Nama device kasir; untuk faktur manual, yang membuat faktur",
  },
  {
    header: "Supplier",
    value: (r) => joined(r.consignorNames),
    width: 20,
    about: "Penitip barang, jika ada barang konsinyasi",
  },
  {
    header: "Konsinyasi",
    value: (r) => (r.isConsignment ? "KONSINYASI" : "NON KONSINYASI"),
    width: 16,
    about: "KONSINYASI jika ada minimal satu barang titipan di faktur",
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
    "Satu baris per faktur: sumber, diskon, biaya lain, pajak, pembayaran, dan konsinyasi. Diunduh sebagai Excel.",
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

/* ---------------------------- Penjualan per invoice, rincian barang */

/** One sheet row: a line of a faktur, or the faktur alone when it has none. */
interface InvoiceLineRow {
  invoice: SalesInvoiceReportRow;
  line: SalesInvoiceReportLine | null;
}

/**
 * A per-invoice column, read off the faktur and repeated on each of its lines
 * — the same definition as Penjualan per invoice, so the two files agree.
 * Not merged (BO, 23 Oktober 2026): one line, one complete row, so the sheet
 * can be filtered and sorted as it is.
 */
const invoiceColumn = (
  header: string,
  rename?: string,
): SalesReportColumn<InvoiceLineRow> => {
  const column = INVOICE_COLUMNS.find((c) => c.header === header);
  if (!column) throw new Error(`Unknown invoice column: ${header}`);
  return {
    ...column,
    header: rename ?? column.header,
    value: (r) => column.value(r.invoice),
  };
};

/**
 * Who and when, then the lines, then how it was paid and where it stands.
 */
const INVOICE_LINE_COLUMNS: SalesReportColumn<InvoiceLineRow>[] = [
  ...[
    "No. faktur",
    "Tanggal faktur",
    "Nama toko",
    "Cabang",
    "Gudang",
    "Pelanggan",
    "No. HP",
    "Tipe pelanggan",
    "Sumber",
  ].map((header) => invoiceColumn(header)),
  {
    header: "Tipe",
    value: (r) => (r.line ? KIND_LABEL[r.line.kind] : null),
    about: "Produk, layanan, atau membership",
  },
  {
    header: "SKU",
    value: (r) => r.line?.sku,
    width: 16,
    about: "Kode produk; untuk layanan dan membership, kodenya",
  },
  {
    header: "Nama barang/layanan",
    value: (r) => r.line?.name,
    width: 30,
    about: "Nama seperti tercetak di faktur",
  },
  {
    header: "Kategori",
    value: (r) => r.line?.categoryName,
    width: 18,
    about:
      "Kategori produk; untuk layanan, kelompoknya (Grooming, Hotel, Antar-Jemput); Membership untuk membership",
  },
  {
    header: "Qty",
    value: (r) => num(r.line?.qty ?? null),
    type: "number",
    about: "Jumlah barang di baris ini",
  },
  {
    header: "Harga satuan",
    value: (r) => num(r.line?.unitPrice ?? null),
    type: "number",
    width: 14,
    about: "Harga per satuan",
  },
  {
    header: "Diskon barang",
    value: (r) => num(r.line?.discount ?? null),
    type: "number",
    width: 14,
    about: "Diskon di baris ini",
  },
  {
    header: "Subtotal barang",
    value: (r) => num(r.line?.net ?? null),
    type: "number",
    width: 16,
    about: "Qty × harga − diskon barang (sebelum diskon faktur dan PPN)",
  },
  invoiceColumn("Akun bayar", "Akun pembayaran"),
  ...["Status", "Catatan"].map((header) => invoiceColumn(header)),
];

/**
 * Penjualan per invoice with each faktur's lines, one sheet row per line, the
 * faktur's own cells repeated on every line.
 */
export const salesInvoiceLineReport: SalesReportDefinition<
  InvoiceLineRow,
  Status
> = {
  ...salesInvoiceReport,
  title: "Penjualan per invoice (rincian barang)",
  description:
    "Setiap faktur dengan barang dan layanannya, satu baris per barang. Diunduh sebagai Excel.",
  fileName: "penjualan-per-invoice-rincian",
  rowNoun: "baris barang",
  columns: INVOICE_LINE_COLUMNS,
  // No merged cells: every line is a full row.
  groupKey: undefined,
  fetch: async (scope, statuses) =>
    (
      await reportService.salesInvoices({ ...scope, statuses, withLines: true })
    ).rows.flatMap((invoice): InvoiceLineRow[] =>
      invoice.lines?.length
        ? invoice.lines.map((line) => ({ invoice, line }))
        : [{ invoice, line: null }],
    ),
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
    about:
      'Nama pelanggan ("Pelanggan umum" untuk pembeli tanpa data di kasir)',
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

/* ------------------------------------------------------ Penjualan POS */

type ShiftStatus = PosSalesReportRow["status"];

const SHIFT_STATUS_LABEL: Record<ShiftStatus, string> = {
  closed: "Ditutup",
  open: "Masih buka",
};

const ALL_SHIFT_STATUSES = Object.keys(SHIFT_STATUS_LABEL) as ShiftStatus[];

/**
 * Which shift, then what it sold and through which method, then how the drawer
 * closed — the order a Z-Report is read in.
 */
const POS_COLUMNS: SalesReportColumn<PosSalesReportRow>[] = [
  {
    header: "No. shift",
    value: (r) => r.shiftNumber,
    width: 18,
    about: "Nomor shift",
  },
  {
    header: "Cabang",
    value: (r) => r.branchName,
    width: 18,
    about: "Cabang kasir",
  },
  {
    header: "Gudang",
    value: (r) => r.warehouseName,
    width: 18,
    about: "Gudang kasir",
  },
  {
    header: "Kasir",
    value: (r) => r.cashierName,
    width: 18,
    about: "Yang membuka shift",
  },
  {
    header: "Status",
    value: (r) => SHIFT_STATUS_LABEL[r.status],
    about: "Ditutup, atau masih buka saat diunduh",
  },
  {
    header: "Tanggal buka",
    value: (r) => r.openedDate,
    type: "date",
    width: 14,
    about: "Tanggal shift dibuka",
  },
  { header: "Jam buka", value: (r) => r.openedTime, about: "Jam shift dibuka" },
  {
    header: "Tanggal tutup",
    value: (r) => r.closedDate,
    type: "date",
    width: 14,
    about: "Kosong kalau shift masih buka",
  },
  {
    header: "Jam tutup",
    value: (r) => r.closedTime,
    about: "Kosong kalau shift masih buka",
  },
  {
    header: "Jumlah transaksi",
    value: (r) => r.transactionCount,
    type: "number",
    about: "Transaksi lunas di shift ini",
  },
  {
    header: "Penjualan kotor",
    value: (r) => num(r.grossSales),
    type: "number",
    width: 16,
    about: "Semua uang masuk dari penjualan, sebelum retur",
  },
  {
    header: "Jumlah retur",
    value: (r) => r.returnCount,
    type: "number",
    about: "Retur yang diproses di shift ini",
  },
  {
    header: "Nilai retur",
    value: (r) => num(r.returns),
    type: "number",
    width: 14,
    about: "Nilai semua retur, apa pun cara pengembaliannya",
  },
  {
    header: "Penjualan bersih",
    value: (r) => num(r.netSales),
    type: "number",
    width: 16,
    about: "Penjualan kotor − nilai retur",
  },
  {
    header: "Tunai",
    value: (r) => num(r.cash),
    type: "number",
    width: 14,
    about: "Diterima tunai, setelah kembalian dan refund tunai",
  },
  {
    header: "Transfer",
    value: (r) => num(r.transfer),
    type: "number",
    width: 14,
    about: "Diterima lewat transfer, setelah refund",
  },
  {
    header: "QRIS",
    value: (r) => num(r.qris),
    type: "number",
    width: 14,
    about: "Diterima lewat QRIS, setelah refund",
  },
  {
    header: "EDC",
    value: (r) => num(r.edc),
    type: "number",
    width: 14,
    about: "Diterima lewat kartu debit/kredit, setelah refund",
  },
  {
    header: "Metode lain",
    value: (r) => num(r.otherMethods),
    type: "number",
    width: 14,
    about: "Metode pembayaran selain empat di atas",
  },
  {
    header: "Kas awal",
    value: (r) => num(r.openingCash),
    type: "number",
    width: 14,
    about: "Uang di laci saat shift dibuka",
  },
  {
    header: "Kas seharusnya",
    value: (r) => num(r.expectedCash),
    type: "number",
    width: 16,
    about:
      "Kas awal + tunai bersih. Untuk shift yang masih buka: posisi saat diunduh",
  },
  {
    header: "Kas dihitung",
    value: (r) => num(r.countedCash),
    type: "number",
    width: 16,
    about: "Uang yang dihitung kasir saat tutup",
  },
  {
    header: "Selisih kas",
    value: (r) => num(r.cashDifference),
    type: "number",
    width: 14,
    about: "Kas dihitung − kas seharusnya. Minus berarti kurang",
  },
  {
    header: "Selisih non-tunai",
    value: (r) => num(r.nonCashDifference),
    type: "number",
    width: 16,
    about: "Total selisih QRIS/EDC/transfer yang dicocokkan saat tutup",
  },
  {
    header: "Catatan tutup",
    value: (r) => r.closingNotes,
    width: 30,
    about: "Catatan kasir saat menutup shift",
  },
];

/**
 * Shift closings and takings per payment method — one row per shift opened in
 * the period.
 */
export const posSalesReport: SalesReportDefinition<
  PosSalesReportRow,
  ShiftStatus
> = {
  title: "Penjualan POS",
  description:
    "Penutupan shift dan rekap per metode pembayaran. Diunduh sebagai Excel.",
  fileName: "penjualan-pos",
  periodLabel: "tanggal buka shift",
  rowNoun: "shift",
  note: "Periode dihitung dari tanggal shift dibuka. Angka per metode dihitung ulang saat diunduh, jadi pembayaran yang dibatalkan setelah shift ditutup ikut terkoreksi.",
  columns: POS_COLUMNS,
  choice: {
    label: "Status shift",
    options: ALL_SHIFT_STATUSES.map((value) => ({
      value,
      label: SHIFT_STATUS_LABEL[value],
    })),
    defaults: ALL_SHIFT_STATUSES,
    summary: (values) =>
      values.length === ALL_SHIFT_STATUSES.length
        ? "Semua"
        : values.map((v) => SHIFT_STATUS_LABEL[v]).join(", "),
  },
  fetch: async (scope, statuses) =>
    (await reportService.posSales({ ...scope, statuses })).rows,
};

/* ----------------------------------------------- Penjualan konsinyasi */

/** By supplier, then what sold, then what it adds to the setoran. */
const CONSIGNMENT_COLUMNS: SalesReportColumn<ConsignmentSalesReportRow>[] = [
  {
    header: "Supplier",
    value: (r) => r.supplierName,
    width: 24,
    about: "Penitip barang",
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
    header: "Qty terjual",
    value: (r) => num(r.soldQty),
    type: "number",
    about: "Qty yang keluar lewat penjualan",
  },
  {
    header: "Qty retur/batal",
    value: (r) => num(r.returnedQty),
    type: "number",
    about: "Qty yang kembali karena retur atau penjualan dibatalkan",
  },
  {
    header: "Qty bersih",
    value: (r) => num(r.netQty),
    type: "number",
    about: "Qty terjual − qty retur/batal",
  },
  {
    header: "Harga titip",
    value: (r) => num(r.unitPrice),
    type: "number",
    width: 14,
    about: "Harga dari supplier per satuan (rata-rata)",
  },
  {
    header: "Nilai terjual",
    value: (r) => num(r.soldAmount),
    type: "number",
    width: 16,
    about: "Qty terjual × harga titip",
  },
  {
    header: "Nilai retur/batal",
    value: (r) => num(r.returnedAmount),
    type: "number",
    width: 16,
    about: "Nilai yang dikurangkan karena retur atau batal",
  },
  {
    header: "Nilai setoran",
    value: (r) => num(r.amount),
    type: "number",
    width: 16,
    about:
      "Nilai terjual − nilai retur/batal. Yang harus disetor ke supplier untuk periode ini",
  },
];

/**
 * Consigned goods sold per supplier — the basis of the setoran. One row per
 * supplier × produk.
 */
export const consignmentSalesReport: SalesReportDefinition<
  ConsignmentSalesReportRow,
  never
> = {
  title: "Penjualan konsinyasi",
  description:
    "Penjualan produk titipan per supplier, dasar perhitungan setoran. Diunduh sebagai Excel.",
  fileName: "penjualan-konsinyasi",
  periodLabel: "tanggal barang keluar",
  rowNoun: "produk titipan",
  note: "Periode dihitung dari tanggal barang keluar atau kembali. Yang sudah disetor tidak dikurangkan di sini — lihat sisanya di Konsinyasi.",
  columns: CONSIGNMENT_COLUMNS,
  fetch: async (scope) => (await reportService.consignmentSales(scope)).rows,
};

/* ---------------------------------------- Rincian pendapatan per produk */

/** One sheet row: a sold line, with its faktur beside it. */
interface RevenueLineRow {
  invoice: SalesInvoiceReportRow;
  line: SalesInvoiceReportLine;
}

/**
 * In the order BO asked for (24 Oktober 2026): which faktur and where from,
 * who bought, the line from its price down to Nett sales and Gross profit,
 * then how it was paid and whose goods. The faktur's columns are Penjualan
 * per invoice's own, repeated on each line like the rincian barang file.
 */
const REVENUE_COLUMNS: SalesReportColumn<RevenueLineRow>[] = [
  {
    header: "Tipe transaksi",
    value: () => "Faktur",
    width: 14,
    about: "Faktur penjualan (kasir dan manual). Retur belum masuk laporan ini",
  },
  invoiceColumn("Tanggal faktur", "Tanggal"),
  ...[
    "No. faktur",
    "REF",
    "Status",
    "Sumber",
    "Nama toko",
    "Cabang",
    "Gudang",
  ].map((header) => invoiceColumn(header)),
  ...["Pelanggan", "Tipe pelanggan"].map((header) => invoiceColumn(header)),
  {
    header: "Nama barang",
    value: (r) => r.line.name,
    width: 30,
    about: "Nama seperti tercetak di faktur (termasuk varian)",
  },
  {
    header: "SKU",
    value: (r) => r.line.sku,
    width: 16,
    about: "Kode produk; untuk layanan dan membership, kodenya",
  },
  {
    header: "Qty",
    value: (r) => num(r.line.qty),
    type: "number",
    about: "Jumlah di baris ini",
  },
  {
    header: "Harga",
    value: (r) => num(r.line.unitPrice),
    type: "number",
    width: 14,
    about: "Harga jual per satuan",
  },
  {
    header: "Sub total",
    value: (r) => num(r.line.lineTotal),
    type: "number",
    width: 14,
    about: "Qty × harga, sebelum diskon",
  },
  {
    header: "Diskon barang",
    value: (r) => num(r.line.discount),
    type: "number",
    width: 14,
    about: "Diskon di baris ini",
  },
  {
    header: "Termasuk pajak",
    value: (r) =>
      r.invoice.taxInclusive === null
        ? null
        : r.invoice.taxInclusive
          ? "Ya"
          : "Tidak",
    width: 14,
    about:
      "Ya jika harga sudah termasuk PPN; Tidak jika PPN ditambahkan di atas harga. Kosong jika tanpa PPN",
  },
  {
    header: "Pajak",
    value: (r) => num(r.line.tax),
    type: "number",
    width: 14,
    about: "Bagian PPN baris ini, dibagi sebanding nilai baris",
  },
  {
    header: "Diskon faktur",
    value: (r) => num(r.line.invoiceDiscount),
    type: "number",
    width: 14,
    about: "Bagian dari diskon faktur, dibagi sebanding nilai baris",
  },
  invoiceColumn("Diskon lainnya"),
  {
    header: "HPP",
    value: (r) => num(r.line.cost),
    type: "number",
    width: 14,
    about:
      "Qty × harga pokok saat barang keluar. 0 untuk layanan; kosong jika HPP produk tidak tercatat",
  },
  {
    header: "Nett sales",
    value: (r) => num(r.line.revenue),
    type: "number",
    width: 16,
    about:
      "Sub total − diskon barang − diskon faktur − PPN (jika termasuk di harga). Sama dengan pendapatan di laba rugi",
  },
  {
    header: "Gross profit",
    value: (r) => num(r.line.profit),
    type: "number",
    width: 16,
    about: "Nett sales − HPP. Kosong jika HPP tidak tercatat",
  },
  invoiceColumn("Akun bayar", "Akun pembayaran"),
  {
    header: "Akun penjualan",
    value: (r) => r.line.salesAccountName,
    width: 26,
    about: "Sub akun pendapatan tempat baris ini dibukukan",
  },
  invoiceColumn("Nama kasir"),
  {
    header: "Supplier",
    value: (r) => joined(r.line.consignorNames),
    width: 20,
    about: "Penitip barang, jika barang ini titipan",
  },
  {
    header: "Konsinyasi",
    value: (r) => (r.line.isConsignment ? "KONSINYASI" : "NON KONSINYASI"),
    width: 16,
    about: "KONSINYASI jika barang yang keluar untuk baris ini titipan",
  },
];

/**
 * Every sold line of the period with its Nett sales, HPP and Gross profit —
 * one row per barang, the faktur's columns beside it.
 */
export const salesRevenueReport: SalesReportDefinition<RevenueLineRow, Kind> = {
  title: "Rincian pendapatan per produk",
  description:
    "Setiap barang terjual dengan pajak, diskon, HPP, nett sales, dan gross profit. Diunduh sebagai Excel.",
  fileName: "rincian-pendapatan-per-produk",
  rowNoun: "baris barang",
  note: "Faktur batal tidak termasuk. Retur penjualan belum mengurangi angka di laporan ini. Profit layanan belum dikurangi komisi atau biaya kerja.",
  columns: REVENUE_COLUMNS,
  choice: {
    label: "Tipe",
    options: ALL_KINDS.map((value) => ({ value, label: KIND_LABEL[value] })),
    // "Per produk": HPP and profit mean most on goods; layanan on request.
    defaults: ["product"],
    summary: (values) =>
      values.length === ALL_KINDS.length
        ? "Semua tipe"
        : values.map((v) => KIND_LABEL[v]).join(", "),
  },
  fetch: async (scope, kinds) =>
    (await reportService.salesRevenue({ ...scope, kinds })).rows.flatMap(
      (invoice) => invoice.lines.map((line) => ({ invoice, line })),
    ),
};
