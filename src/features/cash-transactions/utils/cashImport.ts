import { cashTransactionImportService } from "@/services/cashTransactionImport.service";
import type { CashImportRow, CashImportTemplate } from "@/types/cashImport";
import { saveFile } from "@/utils/saveFile";
import {
  parseGrid,
  readGrid,
  SHEET_FORMATS,
  SheetError,
  type ParsedGrid,
  type SheetSpec,
} from "@/utils/sheetReader";
import {
  buildTemplateWorkbook,
  type ExtraSheet,
  type SheetStyle,
  type TemplateColumnKind,
  type TemplateList,
} from "@/utils/sheetTemplate";

/**
 * The Kas & Bank spreadsheet: this template, and Jubelio's.
 *
 * NOT JUDGED HERE. Cells go up as the text they are, because a number or a date
 * in a cell is the server's to read: see `readImportAmount` in utils/bulkImport.js
 * for why `12.125` is refused rather than guessed.
 */

/** Mirrors `MAX_IMPORT_ROWS`. */
export const CASH_IMPORT_MAX_ROWS = 500;

/** Lowercased header → field. Jubelio's names are this template's names. */
const FIELD_BY_HEADER: Record<string, keyof Omit<CashImportRow, "rowNumber">> = {
  no: "no",
  "tanggal transaksi": "tanggal",
  tipe: "tipe",
  kontak: "kontak",
  cabang: "cabang",
  "akun kas/bank": "akun_kas",
  "nilai kas/bank": "nilai_kas",
  keterangan: "keterangan",
  "detil akun": "detil_akun",
  "sub akun": "sub_akun",
  nilai: "nilai",
  "keterangan detil": "keterangan_detil",
};

/** Jubelio's column that has no use here: dropped without a warning. */
const IGNORED_HEADERS = ["no telp kontak", "no. telp kontak"];

const MAIN_SHEET = "Transaksi";

/** This template's sheet, then Jubelio's, which sits behind two of instructions. */
const DATA_SHEETS = [MAIN_SHEET, "template_kasdanbank"];

const SPEC: SheetSpec<CashImportRow> = {
  requiredColumns: [
    "no",
    "tanggal transaksi",
    "tipe",
    "cabang",
    "akun kas/bank",
    "nilai kas/bank",
    "detil akun",
    "nilai",
  ],
  isKnownColumn: (header) =>
    header in FIELD_BY_HEADER || IGNORED_HEADERS.includes(header),
  /*
    JUBELIO HAS TWO COLUMNS CALLED KETERANGAN. The first is the transaction's, the
    second its line's, so the second is read as Keterangan Detil.
  */
  resolveHeaders: (headers) =>
    headers.map((header, index) =>
      header === "keterangan" && headers.indexOf(header) !== index
        ? "keterangan detil"
        : header,
    ),
  toRow: (cells, headers, rowNumber) => {
    const row: CashImportRow = { rowNumber };

    headers.forEach((header, index) => {
      const field = FIELD_BY_HEADER[header];
      const value = (cells[index] ?? "").trim();
      if (field && value) row[field] = value;
    });

    return { row, problems: [] };
  },
};

export async function readCashImportSheet(
  file: File,
): Promise<ParsedGrid<CashImportRow>> {
  const { grid, sheetName } = await readGrid(file, {
    formats: SHEET_FORMATS,
    preferSheets: DATA_SHEETS,
  });
  const parsed = parseGrid(grid, SPEC);

  if (parsed.rows.length > CASH_IMPORT_MAX_ROWS) {
    throw new SheetError(
      `File ini punya ${parsed.rows.length} baris. Satu file maksimal ${CASH_IMPORT_MAX_ROWS} baris, jadi pecah filenya.`,
    );
  }

  return { ...parsed, sheetName };
}

const COLUMN_KIND: Record<string, TemplateColumnKind> = {
  no: "text",
  "tanggal transaksi": "date",
  cabang: "text",
  "akun kas/bank": "text",
  "detil akun": "text",
  "sub akun": "text",
  "nilai kas/bank": "number",
  nilai: "number",
};

const COLUMN_WIDTH: Record<string, number> = {
  tipe: 14,
  cabang: 24,
  "akun kas/bank": 32,
  keterangan: 28,
  "detil akun": 32,
  "keterangan detil": 28,
};

type TemplateAccount = CashImportTemplate["accounts"][number];

function accountRole(account: TemplateAccount): string {
  if (account.refusal) return "Tidak bisa dipakai";
  return account.isCash ? "Akun Kas/Bank" : "Detil Akun";
}

function accountBranches(account: TemplateAccount): string {
  if (account.branches === null) return "Semua cabang";
  return account.branches.length > 0
    ? account.branches.join(", ")
    : "Tidak ada cabangmu";
}

/** Restricted to branches this user cannot reach: in Daftar Akun, not in a dropdown. */
const inReach = (account: TemplateAccount) => account.branches?.length !== 0;

const TIPE_OPTIONS = ["Pembayaran", "Penerimaan"];
const LIST_SHEET = "Pilihan";

/** What each dropdown offers, one column of the hidden sheet each. */
function listColumns(template: CashImportTemplate) {
  return [
    { column: "tipe", title: "Tipe", options: TIPE_OPTIONS },
    {
      column: "cabang",
      title: "Cabang",
      options: template.branches.map((branch) => branch.label),
    },
    {
      column: "akun kas/bank",
      title: "Akun Kas/Bank",
      options: template.accounts
        .filter((account) => account.isCash && inReach(account))
        .map((account) => account.label),
    },
    {
      column: "detil akun",
      title: "Detil Akun",
      options: template.accounts
        .filter(
          (account) => !account.isCash && !account.refusal && inReach(account),
        )
        .map((account) => account.label),
    },
  ].filter((list) => list.options.length > 0);
}

/** The dropdowns on Transaksi, pointing at the hidden sheet. */
export function templateLists(template: CashImportTemplate): TemplateList[] {
  return listColumns(template).map(({ column, options }, index) => {
    const letter = String.fromCharCode(65 + index);

    return {
      column,
      source: `'${LIST_SHEET}'!$${letter}$2:$${letter}$${options.length + 1}`,
      message:
        column === "tipe"
          ? "Pilih Pembayaran atau Penerimaan."
          : "Pilih dari daftar. Kode saja juga diterima, mis. 6102.",
    };
  });
}

function listSheet(template: CashImportTemplate): ExtraSheet {
  const lists = listColumns(template);
  const depth = Math.max(0, ...lists.map((list) => list.options.length));

  return {
    name: LIST_SHEET,
    hidden: true,
    rows: [
      lists.map((list) => list.title),
      ...Array.from({ length: depth }, (_, row) =>
        lists.map((list) => list.options[row] ?? ""),
      ),
    ],
  };
}

/** Panduan Pengisian's three columns: a key, a short tag, then the explanation. */
const GUIDE_WIDTHS = [22, 15, 80];

interface GuideRow {
  cells: string[];
  styles: (SheetStyle | null)[];
  /** `all` spans A:C; `rest` spans B:C beside a step number. */
  span?: "all" | "rest";
  height?: number;
}

/** Points for a wrapped cell, since a generated file is not fitted when it opens. */
function wrappedHeight(text: string, width: number): number {
  const lines = Math.max(1, Math.ceil((text.length * 1.1) / width));
  return lines * 15 + 8;
}

const fullWidth = GUIDE_WIDTHS.reduce((total, width) => total + width, 0);

const guide = {
  title: (text: string): GuideRow => ({
    cells: [text, "", ""],
    styles: ["title", "title", "title"],
    span: "all",
    height: 36,
  }),
  subtitle: (text: string): GuideRow => ({
    cells: [text, "", ""],
    styles: ["subtitle", "subtitle", "subtitle"],
    span: "all",
    height: wrappedHeight(text, fullWidth),
  }),
  gap: (): GuideRow => ({ cells: [], styles: [], height: 10 }),
  section: (text: string): GuideRow => ({
    cells: [text, "", ""],
    styles: ["section", "section", "section"],
    span: "all",
    height: 24,
  }),
  step: (number: number, text: string, warn = false): GuideRow => ({
    cells: [String(number), text, ""],
    styles: ["step", warn ? "note" : "body", warn ? "note" : "body"],
    span: "rest",
    height: wrappedHeight(text, GUIDE_WIDTHS[1] + GUIDE_WIDTHS[2]),
  }),
  head: (cells: string[]): GuideRow => ({
    cells,
    styles: ["head", "head", "head"],
    height: 22,
  }),
  column: (name: string, required: boolean, text: string): GuideRow => ({
    cells: [name, required ? "Wajib" : "Opsional", text],
    styles: ["key", required ? "required" : "optional", "body"],
    height: wrappedHeight(text, GUIDE_WIDTHS[2]),
  }),
  tab: (name: string, filled: boolean, text: string): GuideRow => ({
    cells: [name, filled ? "Diisi" : "Jangan diubah", text],
    styles: ["key", filled ? "required" : "optional", "body"],
    height: wrappedHeight(text, GUIDE_WIDTHS[2]),
  }),
  point: (text: string, warn = false): GuideRow => ({
    cells: [`•  ${text}`, "", ""],
    styles: warn ? ["note", "note", "note"] : ["body", "body", "body"],
    span: "all",
    height: wrappedHeight(text, fullWidth),
  }),
};

/**
 * The Panduan Pengisian sheet: what each column wants, and the rules a file is
 * held to. Styled in Buloo's colours, since it is read like a page, not filled.
 */
function guideSheet(template: CashImportTemplate): ExtraSheet {
  const { maxLines, backdateMonths } = template.limits;
  const rows: GuideRow[] = [
    guide.title("Panduan Pengisian — Impor Kas & Bank"),
    guide.subtitle(
      "Yang diisi hanya tab Transaksi. Tab lain cuma bacaan dan sumber pilihan — tidak perlu diubah.",
    ),
    guide.gap(),
    guide.section("Tab di file ini"),
    guide.head(["Tab", "Status", "Isinya"]),
    guide.tab(
      "Transaksi",
      true,
      "Satu-satunya tab yang diisi dan dibaca saat upload. Tulis transaksimu di sini.",
    ),
    guide.tab("Panduan Pengisian", false, "Panduan ini."),
    guide.tab(
      "Daftar Akun",
      false,
      "Akun yang bisa dipilih di kolom Akun Kas/Bank dan Detil Akun, beserta cabang dan catatannya.",
    ),
    guide.tab("Daftar Cabang", false, "Cabang yang bisa dipilih di kolom Cabang."),
    ...(template.subAccounts.length > 0
      ? [
          guide.tab(
            "Daftar Sub Akun",
            false,
            "Sub akun yang bisa ditulis di kolom Sub Akun, per akun.",
          ),
        ]
      : []),
    guide.point(
      "Mengubah tab Daftar tidak mengubah apa pun di Buloo. Kalau ada akun atau cabang baru, unduh template lagi supaya pilihannya ikut terbaru.",
    ),
    guide.gap(),
    guide.section("Langkah"),
    guide.step(
      1,
      "Isi transaksi di tab Transaksi. Kolom Tipe, Cabang, Akun Kas/Bank dan Detil Akun punya pilihan: klik selnya, lalu panah di kanan.",
    ),
    guide.step(
      2,
      "Hapus baris berawalan CONTOH sebelum upload. File yang masih berisi baris contoh ditolak.",
      true,
    ),
    guide.step(3, "Simpan sebagai .xlsx, lalu upload di Keuangan › Kas & Bank › Impor."),
    guide.step(
      4,
      "Cek preview. Kalau ada yang salah, seluruh file ditolak dan tidak ada yang tersimpan. Perbaiki baris yang disebut, lalu upload lagi.",
    ),
    guide.gap(),
    guide.section("Isi tiap kolom"),
    guide.head(["Kolom", "Status", "Cara mengisi"]),
    guide.column(
      "No",
      true,
      "Nomor dari catatanmu (mis. nomor nota), tidak boleh sama dalam satu file. Tulis [auto] kalau tidak ada. Nomor bukti kas tetap dibuat sistem.",
    ),
    guide.column(
      "Tanggal Transaksi",
      true,
      `Format YYYY-MM-DD, mis. 2026-11-03. Tidak boleh tanggal yang belum terjadi, paling lama ${backdateMonths} bulan ke belakang.`,
    ),
    guide.column(
      "Tipe",
      true,
      "Pembayaran = uang keluar. Penerimaan = uang masuk.",
    ),
    guide.column("Kontak", false, "Nama penerima atau pengirim, mis. PLN."),
    guide.column("Cabang", true, "Pilih dari daftar."),
    guide.column(
      "Akun Kas/Bank",
      true,
      "Rekening kas/bank yang uangnya keluar atau masuk. Pilih dari daftar.",
    ),
    guide.column(
      "Nilai Kas/Bank",
      true,
      "Total transaksi, angka saja tanpa titik ribuan (1500000). Harus sama dengan jumlah kolom Nilai di transaksi itu.",
    ),
    guide.column("Keterangan", false, "Catatan transaksi."),
    guide.column(
      "Detil Akun",
      true,
      "Akun lawannya, mis. beban untuk Pembayaran atau pendapatan untuk Penerimaan. Pilih dari daftar.",
    ),
    guide.column(
      "Sub Akun",
      false,
      "Kode sub akun milik Detil Akun di baris itu — lihat tab Daftar Sub Akun.",
    ),
    guide.column("Nilai", true, "Nilai untuk Detil Akun di baris itu, angka saja."),
    guide.column("Keterangan Detil", false, "Catatan untuk baris itu."),
    guide.gap(),
    guide.section("Satu transaksi, beberapa akun"),
    guide.point(
      "Baris pertama diisi lengkap. Untuk akun berikutnya, tambah baris di bawahnya dan kosongkan kolom No sampai Keterangan — isi Detil Akun, Sub Akun, Nilai dan Keterangan Detil saja. Lihat CONTOH-1.",
    ),
    guide.point(
      `Satu transaksi maksimal ${maxLines} akun. Satu file maksimal ${CASH_IMPORT_MAX_ROWS} baris.`,
    ),
    guide.gap(),
    guide.section("Perlu diketahui"),
    guide.point(
      "Transfer antar rekening tidak bisa lewat impor — catat di Kas & Bank › Tambah Transaksi.",
      true,
    ),
    guide.point(
      "Akun yang tidak bisa dipakai (mis. Persediaan, Piutang) tidak ada di pilihan. Alasannya ada di kolom Catatan tab Daftar Akun.",
    ),
    guide.point(
      "Akun yang dibatasi ke cabang tertentu hanya bisa dipakai di cabang itu — lihat kolom Cabang di tab Daftar Akun.",
    ),
    guide.point("Upload file yang sama dua kali tidak membuat transaksi dobel."),
  ];

  return {
    name: "Panduan Pengisian",
    first: true,
    widths: GUIDE_WIDTHS,
    gridlines: false,
    rows: rows.map((row) => row.cells),
    styles: rows.map((row) => row.styles),
    heights: rows.map((row) => row.height),
    merges: rows.flatMap((row, index) => {
      const line = index + 1;
      if (row.span === "all") return [`A${line}:C${line}`];
      if (row.span === "rest") return [`B${line}:C${line}`];
      return [];
    }),
  };
}

/** What the workbook carries beside the sheet that gets filled in. */
export function referenceSheets(template: CashImportTemplate): ExtraSheet[] {
  return [
    guideSheet(template),
    {
      name: "Daftar Akun",
      widths: [12, 32, 18, 28, 24, 40],
      rows: [
        ["Kode", "Nama", "Kategori", "Dipakai untuk", "Cabang", "Catatan"],
        ...template.accounts.map((account) => [
          account.code,
          account.name,
          account.category,
          accountRole(account),
          accountBranches(account),
          account.refusal ?? "",
        ]),
      ],
    },
    {
      name: "Daftar Cabang",
      widths: [12, 32],
      rows: [
        ["Kode", "Nama"],
        ...template.branches.map(({ code, name }) => [code ?? "", name]),
      ],
    },
    ...(template.subAccounts.length > 0
      ? [
          {
            name: "Daftar Sub Akun",
            widths: [12, 14, 32],
            rows: [
              ["Kode akun", "Kode sub akun", "Nama"],
              ...template.subAccounts.map((sub) => [
                sub.accountCode,
                sub.code,
                sub.name,
              ]),
            ],
          },
        ]
      : []),
    listSheet(template),
  ];
}

/**
 * The template, built for this tenant.
 *
 * THE EXAMPLES ARE ON THE SHEET THAT GETS READ, for the user to delete. Each is
 * numbered `CONTOH-…` and the server refuses those, so one left behind stops
 * the file rather than becoming a payment. A CSV carries the header alone: it
 * has no dropdowns or guide to explain them.
 */
export async function saveCashImportTemplate(
  format: "xlsx" | "csv",
): Promise<void> {
  const template = await cashTransactionImportService.template();

  if (format === "csv") {
    saveFile(
      new Blob([`﻿${template.columns.join(",")}\n`], {
        type: "text/csv;charset=utf-8",
      }),
      "template-kas-bank.csv",
    );
    return;
  }

  const workbook = await buildTemplateWorkbook(
    [template.columns, ...template.examples],
    {
      sheetName: MAIN_SHEET,
      kindOf: (column) => COLUMN_KIND[column] ?? null,
      widthOf: (column) => COLUMN_WIDTH[column] ?? null,
      extraSheets: referenceSheets(template),
      lists: templateLists(template),
    },
  );

  saveFile(workbook, "template-kas-bank.xlsx");
}
