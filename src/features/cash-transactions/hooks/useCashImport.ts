"use client";

import { useRef, useState } from "react";

import { useSheetImport } from "@/hooks/useSheetImport";
import { ApiError } from "@/services/api-error";
import { cashTransactionImportService } from "@/services/cashTransactionImport.service";
import type {
  CashImportPreview,
  CashImportResult,
  CashImportRow,
  CashImportVerdict,
} from "@/types/cashImport";
import type { ParsedGrid } from "@/utils/sheetReader";

import { readCashImportSheet } from "../utils/cashImport";

/**
 * A Kas & Bank file, checked and saved.
 *
 * `importAnyway` IS ASKED PER FILE, so picking another file clears it, and it
 * only ever opens the button when the file has something else to save. The server
 * decides what the flag means; see cashTransactionImport.service.js.
 */
export function useCashImport() {
  const fileNameRef = useRef<string | undefined>(undefined);
  const [importAnyway, setImportAnyway] = useState(false);

  const upload = useSheetImport<
    CashImportRow,
    CashImportVerdict,
    CashImportPreview,
    CashImportResult,
    ParsedGrid<CashImportRow>
  >({
    read: (file) => {
      fileNameRef.current = file.name;
      setImportAnyway(false);
      return readCashImportSheet(file);
    },
    preview: (sheet) =>
      cashTransactionImportService.preview(sheet.rows.map(({ row }) => row)),
    commit: async (sheet) => {
      try {
        return await cashTransactionImportService.commit({
          rows: sheet.rows.map(({ row }) => row),
          fileName: fileNameRef.current,
          importAnyway,
        });
      } catch (err) {
        // The server may well still be writing. Saying "gagal" would send somebody
        // to re-key what is already in.
        if (err instanceof ApiError && err.isTimeout) {
          throw new ApiError(
            "Server belum selesai menjawab, jadi sebagian transaksi mungkin sudah masuk. Tunggu sebentar, lalu unggah file yang sama lagi: yang sudah masuk akan dilewati.",
            0,
          );
        }
        throw err;
      }
    },
    verdictsOf: (preview) =>
      preview.transactions.map((transaction) => ({
        ...transaction,
        sku: transaction.no,
      })),
    canCommitOf: (preview) =>
      preview.canCommit && (preview.summary.ready > 0 || importAnyway),
    rowNumberOf: (row) => row.rowNumber,
    localVerdict: (row, problems) => ({
      rowNumber: row.rowNumber,
      no: row.no ?? "",
      sku: row.no ?? "",
      status: problems.length > 0 ? "invalid" : "ok",
      problems,
      rowNumbers: [row.rowNumber],
      warnings: [],
      date: null,
      tipe: row.tipe ?? "",
      branchName: null,
      cashAccount: null,
      contact: null,
      note: null,
      lines: [],
      total: null,
      isTransfer: false,
      duplicate: null,
    }),
    autoCheck: true,
    messages: {
      unreadable: "File ini tidak bisa dibaca. Coba simpan ulang dari Excel.",
      checkFailed: "Gagal memeriksa file. Coba lagi.",
      commitFailed: "Gagal menyimpan. Unggah file yang sama lagi untuk mencoba.",
    },
  });

  return { ...upload, importAnyway, setImportAnyway };
}
