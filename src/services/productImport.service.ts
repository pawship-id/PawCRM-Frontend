import { apiClient } from "./api-client";
import type {
  ImportInput,
  ImportPreview,
  ImportResult,
} from "@/types/productImport";

/**
 * Bulk product import calls against `/api/products/import`.
 *
 * Its own service rather than three more methods on `productService`, because
 * the resource it acts on is a FILE rather than a product: `productService` is
 * one typed domain operation per catalogue noun, and an import has no noun of
 * its own to be a verb on.
 *
 * THE THREE CALLS ARE A SEQUENCE, not alternatives — template, then preview,
 * then commit. Nothing here enforces the order; `useProductImport` owns the
 * state machine, and this file stays as thin as every other service.
 */
export const productImportService = {
  /**
   * GET /products/import/template — the blank sheet, as a CSV file.
   *
   * `download` rather than `get` because the server answers with the file
   * itself, not the `{ success, data }` envelope — running one through the
   * other would throw on the first byte. A FAILURE still arrives as JSON and is
   * parsed as one, so a 403 does not silently save a file containing
   * `{"success":false}`.
   */
  template: () =>
    apiClient.download("/products/import/template", {
      fallbackFilename: "template-import-produk.csv",
    }),

  /**
   * POST /products/import/preview — every problem in the file at once.
   *
   * 200, not 201: it writes nothing at all. No product, no movement, no journal
   * entry.
   *
   * Generous timeout next to the default 15s, and for the same reason the ledger
   * export has one: this analyses up to five hundred rows against the catalogue,
   * and the row count is the tenant's rather than ours.
   */
  preview: (input: ImportInput) =>
    apiClient.post<ImportPreview>("/products/import/preview", input, {
      timeoutMs: 60_000,
    }),

  /**
   * POST /products/import — creates every product in the file.
   *
   * REFUSED WITH A 400 if any row is not `ok`, whatever the preview showed: the
   * server re-runs the whole analysis rather than trusting a token, because the
   * catalogue may have moved between the two screens.
   *
   * A LONGER TIMEOUT THAN THE PREVIEW, because this one writes. Five hundred
   * products is a minute of sequential transactions, and a client that gives up
   * at fifteen seconds abandons an import that is still running — leaving the
   * user with no report of the products that were, by then, already created.
   *
   * Retrying is safe without an idempotency key: the SKUs created by the first
   * attempt come back as `conflict` on the next preview, and the batch is
   * refused before anything is written twice.
   */
  commit: (input: ImportInput) =>
    apiClient.post<ImportResult>("/products/import", input, {
      timeoutMs: 180_000,
    }),
};
