import type { ImportRowVerdict } from "./bulkImport";

/**
 * The Kas & Bank upload, against `/api/cash-transactions/import`. Every cell is
 * text: the server gives every verdict, including what a number or a date means.
 */

export interface CashImportRow {
  rowNumber: number;
  no?: string;
  tanggal?: string;
  tipe?: string;
  kontak?: string;
  cabang?: string;
  akun_kas?: string;
  nilai_kas?: string;
  keterangan?: string;
  detil_akun?: string;
  sub_akun?: string;
  nilai?: string;
  keterangan_detil?: string;
}

export type CashImportStatus = "ok" | "invalid";

/** Whether this transaction is already in: and if so, whose doing. */
export type CashImportDuplicate = "other_file" | "same_file" | null;

/** One transaction of the file, addressed by its first row. */
export interface CashImportVerdict extends ImportRowVerdict<CashImportStatus> {
  no: string;
  rowNumbers: number[];
  warnings: string[];
  date: string | null;
  tipe: string;
  branchName: string | null;
  cashAccount: { code: string; name: string } | null;
  contact: string | null;
  note: string | null;
  lines: {
    code: string | null;
    name: string | null;
    amount: string | null;
    memo: string | null;
  }[];
  total: string | null;
  duplicate: CashImportDuplicate;
  existingNumber?: string | null;
}

export interface CashImportPreview {
  summary: {
    transactions: number;
    fileRows: number;
    ok: number;
    problems: number;
    ready: number;
    alreadyImported: number;
    sameFile: number;
    readyAmount: string;
  };
  canCommit: boolean;
  transactions: CashImportVerdict[];
}

export interface CashImportResult {
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  created: { no: string; rowNumber: number; id: string; number: string }[];
  skipped: { no: string; rowNumber: number; number: string | null }[];
  failed: { no: string; rowNumber: number; message: string }[];
}

export interface CashImportTemplate {
  columns: string[];
  limits: { maxLines: number; backdateMonths: number };
  accounts: {
    code: string;
    name: string;
    /** `KODE - Nama`, what a dropdown offers and the server reads back. */
    label: string;
    category: string;
    isCash: boolean;
    refusal: string | null;
    /** The reachable branches it is limited to; null when it is not limited. */
    branches: string[] | null;
  }[];
  branches: { code: string | null; name: string; label: string }[];
  subAccounts: { accountCode: string; code: string; name: string }[];
  examples: string[][];
}
