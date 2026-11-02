import { apiClient } from "./api-client";
import type {
  ProductUpdatePreview,
  ProductUpdateResult,
  ProductUpdateRow,
  ProductUpdateTemplateQuery,
} from "@/types/productBulkUpdate";

/**
 * Bulk product update calls against `/api/products/bulk-update`. A sequence, like
 * `productImportService`: template, preview per batch, then one commit.
 */
export const productBulkUpdateService = {
  /** The whole catalogue can come down, so it gets far longer than the default. */
  template: (query: ProductUpdateTemplateQuery) =>
    apiClient.download("/products/bulk-update/template", {
      query: { ...query },
      fallbackFilename: "data-produk.csv",
      timeoutMs: 120_000,
    }),

  preview: (rows: ProductUpdateRow[]) =>
    apiClient.post<ProductUpdatePreview>(
      "/products/bulk-update/preview",
      { rows },
      { timeoutMs: 60_000 },
    ),

  /**
   * Longer than the import's: five hundred sequential updates, on a database that
   * may be far away. Giving up early abandons a run that is still writing and
   * loses its report. Uploading the file again is safe, and finds only the rest.
   */
  commit: (input: { rows: ProductUpdateRow[]; fileName?: string }) =>
    apiClient.post<ProductUpdateResult>("/products/bulk-update", input, {
      timeoutMs: 300_000,
    }),
};
