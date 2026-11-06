"use client";

import { useState } from "react";

import {
  Alert,
  ImportFilePicker,
  ImportVerdictTable,
  Spinner,
  type TemplateFormat,
} from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  TransferImportStatus,
  TransferImportVerdict,
} from "@/types/transferImport";

import { useTransferImport } from "../hooks/useTransferImport";
import { saveTransferTemplate } from "../utils/transferImport";

const LABELS: Record<TransferImportStatus, string> = {
  ok: "Siap",
  not_found: "Tidak ditemukan",
  duplicate_in_file: "Ganda di file",
  short: "Stok kurang",
  invalid: "Belum benar",
};

/**
 * Fills the transfer form from a spreadsheet.
 *
 * THIS MOVES NOTHING. A transfer has no draft and its goods leave the moment it
 * is saved, so a file must never reach the ledger unseen: it only becomes rows on
 * the form, somebody reads them, and the ordinary Simpan posts them.
 *
 * ALL OR NOTHING. Until every row is fine the button stays off. Half a file on
 * the form is a transfer that quietly leaves goods behind, and the person loading
 * the van would not know which half.
 *
 * ONLY THE ROWS WITH A PROBLEM ARE LISTED. The other hundred and ninety are the
 * ones to ignore, and the row number is how each remaining one is found.
 *
 * THE FILE REPLACES WHAT IS ON THE FORM, and says so first. Merging the two would
 * mean answering, for every product on both, which quantity was meant.
 */
export function TransferImportDialog({
  fromWarehouseId,
  fromWarehouseName,
  hasLines,
  onApply,
  onClose,
}: {
  fromWarehouseId: string;
  fromWarehouseName: string;
  /** Whether the form already holds rows this file would replace. */
  hasLines: boolean;
  onApply: (rows: TransferImportVerdict[]) => void;
  onClose: () => void;
}) {
  const upload = useTransferImport(fromWarehouseId);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const { preview, sheet, rows, canCommit, loading, error } = upload;
  const problemRows = rows.filter((row) => row.status !== "ok");

  const downloadTemplate = (format: TemplateFormat) => {
    setTemplateError(null);
    // The workbook is built in the browser and can fail on its own — a chunk
    // that never loaded — and the CSV needs nothing but the code already here.
    saveTransferTemplate(format).catch(() =>
      setTemplateError("Gagal menyiapkan template. Coba format CSV."),
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Impor file transfer</DialogTitle>
          <DialogDescription>
            Isi kolom <code>sku</code> dan <code>jumlah</code>. Kolom{" "}
            <code>kode_batch</code> dan <code>catatan</code> boleh kosong: produk
            ber-expired tanpa batch memakai batch terdekat kedaluwarsa (FEFO).
            File diperiksa terhadap stok {fromWarehouseName}, dan belum ada
            barang yang keluar sampai transfer disimpan.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <ImportFilePicker
            fileName={upload.fileName}
            onPick={upload.pickFile}
            onDownloadTemplate={downloadTemplate}
            disabled={loading}
            // No sub text under the two formats here (6 Nov 2026, on request).
            xlsxHint=""
            csvHint=""
          />

          {(error || templateError) && (
            <Alert variant="error">{error ?? templateError}</Alert>
          )}

          {loading && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> Memeriksa file…
            </p>
          )}

          {sheet?.sheetName && (
            <Alert variant="info">
              File ini punya lebih dari satu sheet. Yang dibaca:{" "}
              <strong>{sheet.sheetName}</strong>, sheet pertama.
            </Alert>
          )}

          {sheet && sheet.unknownColumns.length > 0 && (
            <Alert variant="info">
              Kolom ini tidak dikenali dan diabaikan:{" "}
              <strong>{sheet.unknownColumns.join(", ")}</strong>.
            </Alert>
          )}

          {preview && canCommit && (
            <Alert variant="success">
              Semua {preview.summary.rows} baris siap masuk ke form.
              {hasLines && " Baris yang sudah ada di form akan diganti isi file ini."}
            </Alert>
          )}

          {preview && !canCommit && (
            <>
              <Alert variant="error">
                {preview.summary.problems} dari {preview.summary.rows} baris perlu
                diperbaiki. Perbaiki di file, lalu unggah ulang. Form baru terisi
                kalau semua barisnya beres.
              </Alert>
              <ImportVerdictTable rows={problemRows} statusLabels={LABELS} />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            disabled={!canCommit || loading}
            onClick={() => {
              onApply(rows);
              onClose();
            }}
          >
            {canCommit ? `Isi ${rows.length} baris ke form` : "Isi ke form"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
