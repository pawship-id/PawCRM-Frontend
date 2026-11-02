"use client";

import { useRef, useState } from "react";

import { useSheetImport } from "@/hooks/useSheetImport";
import { productBulkUpdateService } from "@/services/productBulkUpdate.service";
import type {
  ProductUpdatePreview,
  ProductUpdateResult,
  ProductUpdateRow,
  ProductUpdateVerdict,
} from "@/types/productBulkUpdate";
import type { ParsedGrid } from "@/utils/sheetReader";

import {
  mergePreviews,
  readProductUpdateSheet,
  toBatches,
} from "../utils/productBulkUpdate";

/**
 * A bulk update file, checked and saved.
 *
 * A LARGE FILE IS CHECKED IN BATCHES, ONE AFTER ANOTHER, because the whole
 * catalogue may come back and a request carries 500 rows.
 *
 * THE COMMIT SENDS ONLY THE ROWS THE PREVIEW FOUND CHANGED, which is what lets a
 * file of thousands fit a commit of 500. The server re-derives every change from
 * those rows; it is not told what the changes are.
 */
export function useProductBulkUpdate() {
  const fileNameRef = useRef<string | undefined>(undefined);
  const previewRef = useRef<ProductUpdatePreview | null>(null);
  const [progress, setProgress] = useState<{
    checked: number;
    total: number;
  } | null>(null);

  const upload = useSheetImport<
    ProductUpdateRow,
    ProductUpdateVerdict,
    ProductUpdatePreview,
    ProductUpdateResult,
    ParsedGrid<ProductUpdateRow>
  >({
    read: (file) => {
      fileNameRef.current = file.name;
      return readProductUpdateSheet(file);
    },
    preview: async (sheet) => {
      const rows = sheet.rows.map(({ row }) => row);
      const previews: ProductUpdatePreview[] = [];
      let checked = 0;

      previewRef.current = null;
      setProgress({ checked, total: rows.length });

      try {
        for (const batch of toBatches(rows)) {
          previews.push(await productBulkUpdateService.preview(batch));
          checked += batch.length;
          setProgress({ checked, total: rows.length });
        }
      } finally {
        setProgress(null);
      }

      previewRef.current = mergePreviews(previews);
      return previewRef.current;
    },
    commit: (sheet) => {
      const changed = new Set(
        previewRef.current?.rows
          .filter((row) => row.action === "update")
          .map((row) => row.rowNumber),
      );

      return productBulkUpdateService.commit({
        rows: sheet.rows
          .map(({ row }) => row)
          .filter((row) => changed.has(row.rowNumber)),
        fileName: fileNameRef.current,
      });
    },
    verdictsOf: (preview) => preview.rows,
    canCommitOf: (preview) => preview.canCommit,
    rowNumberOf: (row) => row.rowNumber,
    localVerdict: (row, problems) => ({
      rowNumber: row.rowNumber,
      sku: row.sku ?? "",
      status: problems.length === 0 ? "ok" : "invalid",
      problems,
      productId: null,
      productName: null,
      action: "skip",
      changes: [],
    }),
    autoCheck: true,
    messages: {
      unreadable: "File ini tidak bisa dibaca. Coba simpan ulang lalu unggah lagi.",
      checkFailed: "Gagal memeriksa file. Coba lagi.",
      commitFailed: "Gagal menyimpan. Unggah ulang filenya untuk melihat yang sudah masuk.",
    },
  });

  return { ...upload, progress };
}
