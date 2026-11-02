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
  type TemplateColumnKind,
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

function accountRole(account: CashImportTemplate["accounts"][number]): string {
  if (account.refusal) return "Tidak bisa dipakai";
  return account.isCash ? "Akun Kas/Bank atau Detil Akun" : "Detil Akun";
}

/** What the workbook carries beside the sheet that gets filled in. */
export function referenceSheets(template: CashImportTemplate) {
  return [
    {
      name: "Contoh",
      rows: [template.columns, ...template.examples],
    },
    {
      name: "Daftar Akun",
      rows: [
        ["Kode", "Nama", "Kategori", "Dipakai untuk", "Catatan"],
        ...template.accounts.map((account) => [
          account.code,
          account.name,
          account.category,
          accountRole(account),
          account.refusal ?? "",
        ]),
      ],
    },
    {
      name: "Daftar Cabang",
      rows: [
        ["Kode", "Nama"],
        ...template.branches.map(({ code, name }) => [code ?? "", name]),
      ],
    },
    ...(template.subAccounts.length > 0
      ? [
          {
            name: "Daftar Sub Akun",
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
  ];
}

/**
 * The template, built for this tenant.
 *
 * THE SHEET THAT GETS READ STARTS EMPTY. Examples sit on their own sheet, so one
 * cannot be imported by being left behind. A CSV has nowhere else to put them, so
 * it carries the header alone.
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

  const workbook = await buildTemplateWorkbook([template.columns], {
    sheetName: MAIN_SHEET,
    kindOf: (column) => COLUMN_KIND[column] ?? null,
    extraSheets: referenceSheets(template),
  });

  saveFile(workbook, "template-kas-bank.xlsx");
}
