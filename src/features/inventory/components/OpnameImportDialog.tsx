"use client";

import { useEffect, useState } from "react";

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
import { swalToast } from "@/lib/swal";
import type { Opname } from "@/types/inventory";
import type {
  OpnameImportAction,
  OpnameImportInput,
  OpnameImportQueued,
  OpnameImportStatus,
  OpnameImportVerdict,
} from "@/types/opnameImport";
import { formatQty, toMinor } from "@/utils/decimal";

import { jobActive, useOpnameJob } from "../hooks/useOpnameJob";
import { useOpnameImport } from "../hooks/useOpnameImport";
import { OPNAME_MAX_ITEMS, saveOpnameTemplate } from "../utils/opnameImport";
import { OpnameJobBanner } from "./OpnameJobBanner";

const LABELS: Record<OpnameImportStatus, string> = {
  ok: "Siap",
  not_found: "Tidak ditemukan",
  duplicate_in_file: "Ganda di file",
  invalid: "Belum benar",
};

const ACTIONS: Record<OpnameImportAction, string> = {
  fill: "Isi baris",
  add: "Baris baru",
  new_batch: "Batch baru",
  skip: "Belum dihitung",
};

const qty = (value: string | null) => (value === null ? "—" : formatQty(value));

function diffText(value: string | null): string {
  if (value === null || (toMinor(value) ?? 0n) === 0n) return "—";
  return `${(toMinor(value) ?? 0n) > 0n ? "+" : ""}${formatQty(value)}`;
}

/** Every row is shown: this is the last look before the numbers are on the sheet. */
const COLUMNS = [
  {
    header: "Batch",
    cell: (row: OpnameImportVerdict) => row.batchCode ?? "—",
  },
  {
    header: "Stok sistem",
    align: "right" as const,
    cell: (row: OpnameImportVerdict) => qty(row.systemQty),
  },
  {
    header: "Stok fisik",
    align: "right" as const,
    cell: (row: OpnameImportVerdict) => qty(row.physicalQty),
  },
  {
    header: "Selisih",
    align: "right" as const,
    cell: (row: OpnameImportVerdict) => diffText(row.diffQty),
  },
  {
    header: "Masuk ke lembar",
    cell: (row: OpnameImportVerdict) =>
      row.status === "ok" ? ACTIONS[row.action] : "—",
  },
];

/**
 * Fills an open count sheet from a spreadsheet.
 *
 * THE FILE NEVER FINISHES THE OPNAME. It fills the draft; a person reads the
 * sheet and submits it, like one typed by hand.
 *
 * ALL OR NOTHING: one bad row and nothing lands. A blank `stok_fisik` is not a
 * bad row. It is a shelf nobody reached, and the line stays as it is.
 *
 * A FILE BIGGER THAN ONE SHEET is handed to a background job, which splits it
 * into a group of sheets. The dialog then shows its progress and may be closed:
 * the job carries on, and the sheet shows the same bar.
 */
export function OpnameImportDialog({
  opnameId,
  settle,
  importFile,
  onClose,
}: {
  opnameId: string;
  /** Lands anything still in the auto-save. False when it could not. */
  settle: () => Promise<boolean>;
  importFile: (
    input: OpnameImportInput,
  ) => Promise<Opname | OpnameImportQueued>;
  onClose: () => void;
}) {
  const upload = useOpnameImport(opnameId, { settle, importFile });
  const [templateError, setTemplateError] = useState<string | null>(null);

  const { preview, sheet, rows, canCommit, loading, error, result } = upload;
  const queued = result && "background" in result ? result.job : null;
  /**
   * EVERY ROW, UP TO ONE SHEET'S WORTH. A bigger file is thousands of rows that
   * would only slow the dialog down; there, the rows still to fix are what is
   * worth reading, and each carries its row number in the file.
   */
  const bigFile = rows.length > OPNAME_MAX_ITEMS;
  const shownRows = bigFile ? rows.filter((row) => row.status !== "ok") : rows;
  const watch = useOpnameJob(queued);

  useEffect(() => {
    if (!result || "background" in result) return;

    swalToast("File masuk ke lembar. Cek dulu sebelum menyelesaikan opname.");
    onClose();
  }, [result, onClose]);

  if (watch.job) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Impor file opname</DialogTitle>
            <DialogDescription>
              File ini lebih besar dari satu lembar, jadi dipecah per kategori
              jadi beberapa lembar di background.
            </DialogDescription>
          </DialogHeader>

          <OpnameJobBanner
            job={watch.job}
            onResume={watch.resume}
            resuming={watch.resuming}
            resumeError={watch.error}
          />

          <DialogFooter>
            <Button onClick={onClose}>
              {jobActive(watch.job) ? "Tutup, lanjut di background" : "Tutup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const downloadTemplate = (format: TemplateFormat) => {
    setTemplateError(null);
    saveOpnameTemplate(opnameId, format).catch(() =>
      setTemplateError("Gagal menyiapkan template. Coba lagi."),
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Impor file opname</DialogTitle>
          <DialogDescription>
            Isi kolom <code>stok_fisik</code>. Baris yang kosong dianggap belum
            dihitung, bukan nol. Kolom <code>stok_sistem</code> tidak dibaca:
            selisih selalu dihitung dari stok terbaru. Batch yang belum tercatat
            wajib punya <code>tgl_expired</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <ImportFilePicker
            fileName={upload.fileName}
            onPick={upload.pickFile}
            onDownloadTemplate={downloadTemplate}
            disabled={loading}
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

          {preview && canCommit && preview.background && (
            <Alert variant="info">
              {preview.summary.filled} baris terisi — lebih banyak dari satu
              lembar (maksimal 1.000 baris). File ini akan dipecah per kategori
              jadi <b>{preview.summary.sheets} lembar</b> dan diproses di
              background, jadi kamu tidak perlu menunggu. Lembar ini jadi bagian
              pertama.
            </Alert>
          )}

          {preview && canCommit && !preview.background && (
            <Alert variant="success">
              {preview.summary.filled} baris siap masuk ke lembar
              {preview.summary.added > 0 &&
                `, termasuk ${preview.summary.added} baris baru`}
              .
              {preview.summary.skipped > 0 &&
                ` ${preview.summary.skipped} baris kosong dilewati.`}{" "}
              Opname belum selesai sampai diselesaikan di lembar.
            </Alert>
          )}

          {preview && !canCommit && preview.summary.problems > 0 && (
            <Alert variant="error">
              {preview.summary.problems} dari {preview.summary.rows} baris perlu
              diperbaiki. Perbaiki di file, lalu unggah ulang. Lembar baru terisi
              kalau semua barisnya beres.
            </Alert>
          )}

          {preview && !canCommit && preview.summary.problems === 0 && (
            <Alert variant="info">
              Belum ada <code>stok_fisik</code> yang terisi di file ini.
            </Alert>
          )}

          {preview && shownRows.length > 0 && (
            <ImportVerdictTable
              rows={shownRows}
              statusLabels={LABELS}
              extraColumns={COLUMNS}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button disabled={!canCommit || loading} onClick={upload.commit}>
            {canCommit && preview
              ? preview.background
                ? `Proses di background (${preview.summary.sheets} lembar)`
                : `Isi ${preview.summary.filled} baris ke lembar`
              : "Isi ke lembar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
