"use client";

import { useCallback, useState } from "react";

import { useSheetImport, type ImportStep } from "@/hooks/useSheetImport";
import { ApiError } from "@/services/api-error";
import { productImportService } from "@/services/productImport.service";
import type {
  ImportPreview,
  ImportResult,
  ImportRow,
  ImportVerdict,
} from "@/types/productImport";
import { saveFile } from "@/utils/saveFile";

import { readSheet, type ParsedSheet } from "../utils/sheet";
import { csvToTemplateWorkbook } from "../utils/templateWorkbook";

/**
 * The product import, on the shared upload state machine in `useSheetImport`:
 * pick a file, check it, commit it. What is left here is what only this import
 * has: the warehouse its opening stock lands in, and a template the server serves.
 */

export type { ImportStep };

/**
 * `.xlsx` is the default because it is the one that cannot corrupt a barcode:
 * a Text-formatted column keeps a leading zero, and a General one loses it
 * before any of our code runs. `.csv` stays for Google Sheets and for anyone
 * whose tooling prefers it.
 */
export type TemplateFormat = "xlsx" | "csv";

interface UseProductImportResult {
  step: ImportStep;

  /** The parsed file, or null before one is picked. */
  sheet: ParsedSheet | null;
  fileName: string | null;
  warehouseId: string;
  setWarehouseId: (id: string) => void;

  preview: ImportPreview | null;
  result: ImportResult | null;

  /** Server verdicts merged with the parser's own problems — see `rows`. */
  rows: ImportVerdict[];
  /** True when nothing at all stands in the way of committing. */
  canCommit: boolean;

  loading: boolean;
  error: string | null;

  pickFile: (file: File) => Promise<void>;
  check: () => Promise<void>;
  commit: () => Promise<void>;
  reset: () => void;
  downloadTemplate: (format?: TemplateFormat) => Promise<void>;
}

export function useProductImport(): UseProductImportResult {
  const [warehouseId, setWarehouseId] = useState("");

  // Sent only when a row needs it — the API refuses the request otherwise, and
  // a warehouse on a pure catalogue import is a value nobody chose.
  const inputOf = (sheet: ParsedSheet) => ({
    ...(sheet.needsWarehouse && warehouseId ? { warehouseId } : {}),
    rows: sheet.rows.map(({ row }) => row),
  });

  const upload = useSheetImport<
    ImportRow,
    ImportVerdict,
    ImportPreview,
    ImportResult,
    ParsedSheet
  >({
    read: readSheet,
    preview: (sheet) => productImportService.preview(inputOf(sheet)),
    commit: (sheet) => productImportService.commit(inputOf(sheet)),
    verdictsOf: (preview) => preview.rows,
    canCommitOf: (preview) => preview.canCommit,
    rowNumberOf: (row) => row.rowNumber,
    localVerdict: (row, problems) => ({
      rowNumber: row.rowNumber,
      sku: row.sku ?? "",
      status: problems.length === 0 ? "ok" : "invalid",
      problems,
    }),
    messages: {
      unreadable: "File tidak bisa dibaca. Pastikan formatnya CSV.",
      checkFailed: "Gagal memeriksa file.",
      commitFailed: "Gagal menyimpan. Tidak ada produk yang dibuat.",
    },
  });

  const { setError } = upload;

  const reset = () => {
    upload.reset();
    setWarehouseId("");
  };

  /**
   * Saves the template, in whichever of the two formats was asked for.
   *
   * ONE SOURCE, TWO FILES. The server serves CSV and only CSV; the workbook is
   * built here FROM that CSV, so a column added or renamed on the server appears
   * in both downloads with no change on this side. See `templateWorkbook.ts` for
   * what the `.xlsx` adds that a CSV cannot carry — column formats, without
   * which a barcode with a leading zero is corrupted the moment it is typed.
   */
  const downloadTemplate = useCallback(
    async (format: TemplateFormat = "xlsx") => {
      setError(null);

      try {
        const { blob, filename } = await productImportService.template();

        const [file, name] =
          format === "csv"
            ? [blob, filename]
            : [
                await csvToTemplateWorkbook(await blob.text()),
                filename.replace(/\.csv$/i, ".xlsx"),
              ];

        saveFile(file, name);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : // The conversion runs in the browser and can fail on its own — a
              // chunk that never loaded — so the message must not claim the
              // server refused something it answered perfectly well.
              "Gagal menyiapkan template. Coba format satunya.",
        );
      }
    },
    [setError],
  );

  return {
    step: upload.step,
    sheet: upload.sheet,
    fileName: upload.fileName,
    warehouseId,
    setWarehouseId,
    preview: upload.preview,
    result: upload.result,
    rows: upload.rows,
    canCommit: upload.canCommit,
    loading: upload.loading,
    error: upload.error,
    pickFile: upload.pickFile,
    check: upload.check,
    commit: upload.commit,
    reset,
    downloadTemplate,
  };
}
