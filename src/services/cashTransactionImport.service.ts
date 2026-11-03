import { apiClient } from "./api-client";
import type {
  CashImportPreview,
  CashImportResult,
  CashImportRow,
  CashImportTemplate,
} from "@/types/cashImport";

/**
 * The Kas & Bank upload against `/api/cash-transactions/import`: template data,
 * one preview, one commit. The workbook itself is built in the browser.
 */
export const cashTransactionImportService = {
  template: () =>
    apiClient.get<CashImportTemplate>("/cash-transactions/import/template"),

  preview: (rows: CashImportRow[]) =>
    apiClient.post<CashImportPreview>(
      "/cash-transactions/import/preview",
      { rows },
      { timeoutMs: 60_000 },
    ),

  /**
   * MATCHES THE PROXY IN FRONT OF THE API, whose read timeout is 300 s. Measured
   * at about 19 database round trips per transaction, so 500 fit up to roughly
   * 30 ms of latency to the database. Giving up early would leave a run writing
   * with nobody to read its report. Uploading the file again is safe: what landed
   * is skipped.
   */
  commit: (input: {
    rows: CashImportRow[];
    fileName?: string;
    importAnyway: boolean;
  }) =>
    apiClient.post<CashImportResult>("/cash-transactions/import", input, {
      timeoutMs: 300_000,
    }),
};
