"use client";

import { useState } from "react";
import Link from "next/link";

import {
  Alert,
  Card,
  CheckRow,
  ImportFailedList,
  ImportFilePicker,
  ImportVerdictTable,
  Spinner,
  StatTile,
  type TemplateFormat,
} from "@/components";
// The shadcn button: only this one takes `asChild`, for the Link below.
import { Button } from "@/components/ui/button";
import type { CashImportResult, CashImportVerdict } from "@/types/cashImport";
import { formatMoney } from "@/utils/decimal";

import { useCashImport } from "../hooks/useCashImport";
import { CASH_TRANSACTIONS_HREF } from "../labels";
import { CASH_IMPORT_MAX_ROWS, saveCashImportTemplate } from "../utils/cashImport";

const LABELS: Record<string, string> = {
  ok: "Siap",
  invalid: "Belum benar",
};

function DetailCell({ row }: { row: CashImportVerdict }) {
  if (row.lines.length === 0) return <span className="text-muted">—</span>;

  return (
    <ul className="flex flex-col gap-0.5">
      {row.lines.map((line, index) => (
        <li key={`${line.code}-${index}`}>
          {line.code ?? "?"} {line.name ?? ""}
          {line.amount ? ` · ${formatMoney(line.amount)}` : ""}
        </li>
      ))}
    </ul>
  );
}

function NoteCell({ row }: { row: CashImportVerdict }) {
  const notes = [
    ...(row.duplicate === "other_file"
      ? [`Sudah pernah diimpor${row.existingNumber ? `: ${row.existingNumber}` : ""}`]
      : []),
    ...(row.duplicate === "same_file"
      ? [`Sudah masuk dari file ini${row.existingNumber ? `: ${row.existingNumber}` : ""}`]
      : []),
    ...row.warnings,
  ];

  if (notes.length === 0) return <span className="text-muted">—</span>;

  return (
    <ul className="flex flex-col gap-0.5">
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
}

const COLUMNS = [
  {
    header: "Tanggal",
    cell: (row: CashImportVerdict) => row.date ?? "—",
  },
  {
    header: "Tipe",
    cell: (row: CashImportVerdict) => row.tipe || "—",
  },
  {
    header: "Cabang · Kas/Bank",
    cell: (row: CashImportVerdict) =>
      [row.branchName, row.cashAccount?.name].filter(Boolean).join(" · ") || "—",
  },
  {
    header: "Detil akun",
    cell: (row: CashImportVerdict) => <DetailCell row={row} />,
  },
  {
    header: "Total",
    align: "right" as const,
    cell: (row: CashImportVerdict) => (row.total ? formatMoney(row.total) : "—"),
  },
  {
    header: "Catatan",
    cell: (row: CashImportVerdict) => <NoteCell row={row} />,
  },
];

function ResultPanel({
  result,
  onReset,
}: {
  result: CashImportResult;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Alert variant={result.failedCount > 0 ? "warning" : "success"}>
        {result.createdCount} transaksi tersimpan
        {result.skippedCount > 0 &&
          `, ${result.skippedCount} dilewati karena sudah pernah masuk`}
        {result.failedCount > 0 && `, ${result.failedCount} gagal`}.
      </Alert>

      {result.failed.length > 0 && (
        <ImportFailedList
          title="Yang gagal disimpan"
          description="Transaksi lain sudah tersimpan. Unggah file yang sama lagi: yang sudah masuk tidak akan ditulis dua kali."
          entries={result.failed.map(({ no, rowNumber, message }) => ({
            label: no,
            rowNumbers: [rowNumber],
            message,
          }))}
        />
      )}

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={CASH_TRANSACTIONS_HREF}>Kembali ke Kas &amp; Bank</Link>
        </Button>
        <Button variant="secondary" onClick={onReset}>
          Unggah file lain
        </Button>
      </div>
    </div>
  );
}

/**
 * Kas & Bank → Impor.
 *
 * The step is the data, as on the other uploads: no file, then a file with its
 * preview, then a result. One row of this table is one TRANSACTION, however many
 * rows of the file it took, which is what somebody checks before saving money.
 */
export function CashImportScreen() {
  const upload = useCashImport();
  const { sheet, preview, rows, canCommit, loading, error, result } = upload;
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const download = async (format: TemplateFormat) => {
    setTemplateError(null);
    setDownloading(true);

    try {
      await saveCashImportTemplate(format);
    } catch {
      setTemplateError("Gagal menyiapkan template. Coba lagi.");
    } finally {
      setDownloading(false);
    }
  };

  if (result) {
    return <ResultPanel result={result} onReset={upload.reset} />;
  }

  const summary = preview?.summary;
  const transactions = preview ? rows : [];
  const warned = transactions.some((row) => row.warnings.length > 0);
  const saveCount =
    (summary?.ready ?? 0) +
    (upload.importAnyway ? (summary?.alreadyImported ?? 0) : 0);

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="1. Unduh template, isi, lalu unggah"
        description={`Satu file maksimal ${CASH_IMPORT_MAX_ROWS} baris dan 20 akun per transaksi. Tanggal paling lama 3 bulan ke belakang. Untuk beberapa akun, kosongkan kolom utama di baris lanjutan.`}
      >
        <div className="flex flex-col gap-4">
          <ImportFilePicker
            fileName={upload.fileName}
            onPick={upload.pickFile}
            onDownloadTemplate={download}
            disabled={loading || downloading}
            templateNote="Template Excel berisi contoh transaksi (hapus sebelum upload), pilihan akun dan cabang, serta sheet Panduan Pengisian. Format template Jubelio juga bisa dibaca, selama ada kolom Cabang."
          />

          {(error || templateError) && (
            <Alert variant="error">{error ?? templateError}</Alert>
          )}

          {downloading && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> Menyiapkan template…
            </p>
          )}
        </div>
      </Card>

      {sheet && (
        <Card
          title="2. Periksa per transaksi"
          description="Nomor baris mengikuti file kamu. Transaksi disimpan satu per satu, dan nomor bukti tetap dibuat sistem."
        >
          <div className="flex flex-col gap-4">
            {sheet.unknownColumns.length > 0 && (
              <Alert variant="warning">
                Kolom ini diabaikan dan tidak akan disimpan:{" "}
                <strong>{sheet.unknownColumns.join(", ")}</strong>.
              </Alert>
            )}

            {loading && (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Spinner />
                {preview
                  ? "Menyimpan… jangan tutup halaman ini."
                  : "Memeriksa file…"}
              </p>
            )}

            {!preview && !loading && (
              <Button variant="secondary" onClick={upload.check}>
                Periksa ulang
              </Button>
            )}

            {summary && (
              <div className="grid gap-4 sm:grid-cols-4">
                <StatTile label="Transaksi" value={String(summary.transactions)} />
                <StatTile label="Siap disimpan" value={String(summary.ready)} />
                <StatTile
                  label="Sudah pernah masuk"
                  value={String(summary.alreadyImported + summary.sameFile)}
                />
                <StatTile label="Nilai siap disimpan" value={formatMoney(summary.readyAmount)} />
              </div>
            )}

            {summary && summary.problems > 0 && (
              <Alert variant="error">
                {summary.problems} transaksi masih bermasalah. File baru bisa
                disimpan kalau semuanya beres.
              </Alert>
            )}

            {warned && (
              <Alert variant="warning">
                Ada transaksi bertanggal bulan lalu. Laporan bulan itu ikut
                berubah saat disimpan.
              </Alert>
            )}

            {summary && summary.sameFile > 0 && (
              <Alert variant="info">
                {summary.sameFile} transaksi sudah masuk dari file yang sama dan
                akan dilewati.
              </Alert>
            )}

            {summary && summary.alreadyImported > 0 && (
              <Alert variant="warning">
                <div className="flex flex-col gap-2">
                  <p>
                    {summary.alreadyImported} transaksi sama persis dengan yang
                    pernah diimpor: tanggal, tipe, cabang, akun, dan nilainya.
                    Transaksi ini dilewati, kecuali memang transaksi baru.
                  </p>
                  <CheckRow
                    label="Tetap impor, ini transaksi baru"
                    checked={upload.importAnyway}
                    disabled={loading}
                    onCheckedChange={upload.setImportAnyway}
                  />
                </div>
              </Alert>
            )}

            {transactions.length > 0 && (
              <ImportVerdictTable
                rows={transactions}
                statusLabels={LABELS}
                identityHeader="No"
                extraColumns={COLUMNS}
              />
            )}

            <div>
              <Button onClick={upload.commit} disabled={!canCommit || loading}>
                {`Simpan ${saveCount} transaksi`}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
