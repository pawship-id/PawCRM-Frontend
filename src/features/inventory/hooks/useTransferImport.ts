"use client";

import { useSheetImport } from "@/hooks/useSheetImport";
import { stockTransferService } from "@/services/stockTransfer.service";
import type {
  TransferImportPreview,
  TransferImportRow,
  TransferImportVerdict,
} from "@/types/transferImport";
import type { ParsedGrid } from "@/utils/sheetReader";

import { readTransferSheet } from "../utils/transferImport";

/**
 * A transfer file, read and resolved against the source shelf.
 *
 * NO COMMIT: a transfer has no draft and its goods leave when it is saved, so the
 * file only fills the form. Resolved as soon as it is read, because the warehouse
 * is already chosen and there is nothing left to ask first.
 */
export function useTransferImport(fromWarehouseId: string) {
  return useSheetImport<
    TransferImportRow,
    TransferImportVerdict,
    TransferImportPreview,
    never,
    ParsedGrid<TransferImportRow>
  >({
    read: readTransferSheet,
    preview: (sheet) =>
      stockTransferService.resolveImport({
        fromWarehouseId,
        rows: sheet.rows.map(({ row }) => row),
      }),
    verdictsOf: (preview) => preview.rows,
    canCommitOf: (preview) => preview.canCommit,
    rowNumberOf: (row) => row.rowNumber,
    localVerdict: (row, problems) => ({
      rowNumber: row.rowNumber,
      sku: row.sku ?? "",
      status: problems.length === 0 ? "ok" : "invalid",
      problems,
      productId: null,
      product: null,
      qty: null,
      batchId: null,
      batchCode: null,
      autoFefo: false,
      notes: null,
      available: null,
      onHand: null,
    }),
    autoCheck: true,
    messages: {
      unreadable: "File tidak bisa dibaca. Pakai .xlsx atau .csv dari template.",
      checkFailed: "Gagal memeriksa file. Coba lagi.",
    },
  });
}
