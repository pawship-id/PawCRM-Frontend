"use client";

import { useCallback, useMemo, useState } from "react";

import { ApiError } from "@/services/api-error";
import { productImportService } from "@/services/productImport.service";
import type {
  ImportPreview,
  ImportResult,
  ImportVerdict,
} from "@/types/productImport";

import {
  readSheet,
  SheetError,
  type ParsedSheet,
} from "../utils/sheet";
import { csvToTemplateWorkbook } from "../utils/templateWorkbook";

/**
 * The import's state machine: pick a file, check it, commit it.
 *
 * THREE STEPS, AND THE STEP IS DERIVED rather than stored. A `step` in state
 * alongside `sheet`, `preview` and `result` is four variables that can disagree
 * — a screen showing step 3 with no result is a blank panel nobody can explain.
 * Here the step IS the data: no sheet means step 1, a sheet with no result means
 * step 2, a result means step 3.
 *
 * THE CLIENT NEVER DECIDES WHETHER A FILE MAY BE COMMITTED. `canCommit` comes
 * from the server's own preview and is passed through untouched, and the commit
 * is refused server-side regardless. The local problems below can only make the
 * button MORE disabled, never less.
 */

export type ImportStep = "pick" | "check" | "done";

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
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step: ImportStep = result ? "done" : sheet ? "check" : "pick";

  /**
   * Rows the screen renders: the server's verdicts, with the parser's own
   * problems folded in.
   *
   * MERGED RATHER THAN SHOWN SEPARATELY, because they are the same thing to the
   * person fixing them — "baris 12 salah, ini kenapa" — and two tables of
   * problems is two places to look for a file that has both. A row carrying a
   * local problem is `invalid` whatever the server said about it, since the
   * server was never sent the cell that is wrong.
   *
   * Before a preview exists the local problems stand alone, so a file with a
   * mistyped price shows what is wrong with it before any request is made.
   */
  const rows = useMemo<ImportVerdict[]>(() => {
    if (!sheet) return [];

    const byRow = new Map(
      (preview?.rows ?? []).map((verdict) => [verdict.rowNumber, verdict]),
    );

    return sheet.rows.map(({ row, problems }) => {
      const verdict = byRow.get(row.rowNumber);

      if (problems.length === 0) {
        return (
          verdict ?? {
            rowNumber: row.rowNumber,
            sku: row.sku ?? "",
            status: "ok",
            problems: [],
          }
        );
      }

      return {
        rowNumber: row.rowNumber,
        sku: row.sku ?? "",
        status: "invalid",
        problems: [...problems, ...(verdict?.problems ?? [])],
      };
    });
  }, [sheet, preview]);

  const hasLocalProblems = useMemo(
    () => (sheet?.rows ?? []).some(({ problems }) => problems.length > 0),
    [sheet],
  );

  const canCommit = Boolean(preview?.canCommit) && !hasLocalProblems;

  const reset = useCallback(() => {
    setSheet(null);
    setFileName(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setWarehouseId("");
  }, []);

  const pickFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    // A new file invalidates the old verdicts. Keeping them would show a preview
    // of one file next to the row count of another.
    setPreview(null);
    setResult(null);

    try {
      const parsed = await readSheet(file);
      setSheet(parsed);
      setFileName(file.name);
    } catch (err) {
      setSheet(null);
      setFileName(null);
      setError(
        err instanceof SheetError
          ? err.message
          : "File tidak bisa dibaca. Pastikan formatnya CSV.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const check = useCallback(async () => {
    if (!sheet) return;

    setLoading(true);
    setError(null);

    try {
      const next = await productImportService.preview({
        // Sent only when a row needs it — the API refuses the request otherwise,
        // and a warehouse on a pure catalogue import is a value nobody chose.
        ...(sheet.needsWarehouse && warehouseId ? { warehouseId } : {}),
        rows: sheet.rows.map(({ row }) => row),
      });
      setPreview(next);
    } catch (err) {
      setPreview(null);
      setError(
        err instanceof ApiError ? err.message : "Gagal memeriksa file.",
      );
    } finally {
      setLoading(false);
    }
  }, [sheet, warehouseId]);

  const commit = useCallback(async () => {
    if (!sheet) return;

    setLoading(true);
    setError(null);

    try {
      const next = await productImportService.commit({
        ...(sheet.needsWarehouse && warehouseId ? { warehouseId } : {}),
        rows: sheet.rows.map(({ row }) => row),
      });
      setResult(next);
    } catch (err) {
      /**
       * A refused commit sends the user back to the check step rather than
       * forward, and the preview is CLEARED — the catalogue moved between the
       * two screens, so the verdicts on screen are the stale reading that let
       * the commit be attempted. Leaving them up would show green rows beside a
       * refusal.
       */
      setPreview(null);
      setError(
        err instanceof ApiError
          ? err.message
          : "Gagal menyimpan. Tidak ada produk yang dibuat.",
      );
    } finally {
      setLoading(false);
    }
  }, [sheet, warehouseId]);

  /**
   * Saves the template, in whichever of the two formats was asked for.
   *
   * ONE SOURCE, TWO FILES. The server serves CSV and only CSV; the workbook is
   * built here FROM that CSV, so a column added or renamed on the server appears
   * in both downloads with no change on this side. See `templateWorkbook.ts` for
   * what the `.xlsx` adds that a CSV cannot carry — column formats, without
   * which a barcode with a leading zero is corrupted the moment it is typed.
   *
   * The object URL is revoked immediately: the anchor click is synchronous into
   * the browser's download manager, and one left behind pins the whole blob in
   * memory. Same shape StockCardScreen's export uses.
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

        const url = URL.createObjectURL(file);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = name;
        anchor.click();
        URL.revokeObjectURL(url);
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
    [],
  );

  return {
    step,
    sheet,
    fileName,
    warehouseId,
    setWarehouseId,
    preview,
    result,
    rows,
    canCommit,
    loading,
    error,
    pickFile,
    check,
    commit,
    reset,
    downloadTemplate,
  };
}
