"use client";

import { useRef } from "react";

import { useSheetImport } from "@/hooks/useSheetImport";
import { ApiError } from "@/services/api-error";
import { stockOpnameService } from "@/services/stockOpname.service";
import type { Opname } from "@/types/inventory";
import type {
  OpnameImportInput,
  OpnameImportPreview,
  OpnameImportRow,
  OpnameImportVerdict,
} from "@/types/opnameImport";
import type { ParsedGrid } from "@/utils/sheetReader";

import { readOpnameSheet } from "../utils/opnameImport";
import { SHEET_NOT_SAVED } from "./useOpnameSheet";

/**
 * An opname file, checked against the open draft and then written into it.
 *
 * THE SHEET IS SETTLED BEFORE EITHER CALL. The preview must read the sheet the
 * counter sees, and the commit merges into the stored one, so anything still in
 * the auto-save has to land first. A sheet that cannot be saved stops the import:
 * going ahead would replace typed counts with a sheet that never had them.
 */
export function useOpnameImport(
  opnameId: string,
  {
    settle,
    importFile,
  }: {
    settle: () => Promise<boolean>;
    importFile: (input: OpnameImportInput) => Promise<Opname>;
  },
) {
  const fileNameRef = useRef<string | undefined>(undefined);

  const assertSettled = async () => {
    if (!(await settle())) throw new ApiError(SHEET_NOT_SAVED, 409);
  };

  const rowsOf = (sheet: ParsedGrid<OpnameImportRow>) =>
    sheet.rows.map(({ row }) => row);

  return useSheetImport<
    OpnameImportRow,
    OpnameImportVerdict,
    OpnameImportPreview,
    Opname,
    ParsedGrid<OpnameImportRow>
  >({
    read: (file) => {
      fileNameRef.current = file.name;
      return readOpnameSheet(file);
    },
    preview: async (sheet) => {
      await assertSettled();
      return stockOpnameService.previewImport(opnameId, {
        rows: rowsOf(sheet),
      });
    },
    commit: (sheet) =>
      importFile({ rows: rowsOf(sheet), fileName: fileNameRef.current }),
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
      batchCode: null,
      expiryDate: null,
      systemQty: null,
      physicalQty: null,
      diffQty: null,
      notes: null,
    }),
    autoCheck: true,
    messages: {
      unreadable: "File tidak bisa dibaca. Pakai .xlsx atau .csv dari template.",
      checkFailed: "Gagal memeriksa file. Coba lagi.",
      commitFailed: "File gagal diimpor. Coba lagi.",
    },
  });
}
