"use client";

import { Alert, Button, Card, Spinner } from "@/components";

import { useProductImport } from "../hooks/useProductImport";
import { useWarehouseOptions } from "../hooks/useWarehouseOptions";
import { ImportDropzone } from "./ImportDropzone";
import { ImportPreviewTable } from "./ImportPreviewTable";
import { ImportResultPanel } from "./ImportResultPanel";

/**
 * Bulk product import — Inventory → Produk → Import.
 *
 * Three steps, and the step is DERIVED from the data rather than stored: no
 * sheet means step 1, a sheet with no result means step 2, a result means step
 * 3. A `step` variable alongside the data is a fourth thing that can disagree
 * with the other three, and the screen it produces when it does — step 3 with no
 * result — is a blank panel nobody can explain. See `useProductImport`.
 *
 * WHAT THIS SCREEN DOES NOT DO is decide anything. It parses a file, shows what
 * the server said about it, and sends it back. Whether a SKU is free, whether a
 * category exists, whether a family agrees with itself — every one of those
 * questions is answered once, server-side, and rendered here. The one thing
 * judged locally is cell FORMAT (is that a number, is that a date), and only
 * because a malformed cell would otherwise come back as a request-level 400 that
 * names no row.
 */
export function ImportScreen() {
  const {
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
  } = useProductImport();

  const { warehouses } = useWarehouseOptions();

  // Asked for only when the sheet turns out to need one — a pure catalogue
  // import never sees the question, so it must not block the button either.
  const warehouseMissing = Boolean(sheet?.needsWarehouse) && warehouseId === "";

  // The heading and the breadcrumb belong to the page, as on every other screen
  // in this feature — a component that renders its own <h1> cannot be embedded
  // anywhere but the route it was written for.
  if (step === "done" && result) {
    return <ImportResultPanel result={result} onReset={reset} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert variant="error">{error}</Alert>}

      <ImportDropzone
        fileName={fileName}
        needsWarehouse={Boolean(sheet?.needsWarehouse)}
        warehouses={warehouses}
        warehouseId={warehouseId}
        onWarehouseChange={setWarehouseId}
        onPick={pickFile}
        onDownloadTemplate={downloadTemplate}
        disabled={loading}
      />

      {sheet && (
        <Card
          title="2. Periksa"
          description="Semua baris harus beres dulu. Tidak ada opsi melewati baris bermasalah — file yang masuk separuh adalah katalog yang tidak bisa direkonsiliasi belakangan."
        >
          <div className="flex flex-col gap-4">
            {sheet.sheetName && (
              <Alert variant="info">
                File ini punya lebih dari satu sheet. Yang dibaca:{" "}
                <strong>{sheet.sheetName}</strong> — sheet pertama. Kalau datanya
                ada di sheet lain, pindahkan ke urutan pertama lalu unggah ulang.
              </Alert>
            )}

            {sheet.unknownColumns.length > 0 && (
              <Alert variant="info">
                Kolom ini tidak dikenali dan diabaikan:{" "}
                <strong>{sheet.unknownColumns.join(", ")}</strong>. Kalau ini
                salah ketik, perbaiki namanya — isinya tidak akan ikut terkirim.
              </Alert>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={check} disabled={loading || warehouseMissing}>
                {loading ? <Spinner /> : null}
                {preview ? "Periksa ulang" : "Periksa file"}
              </Button>

              {warehouseMissing && (
                <span className="text-xs text-muted">
                  Pilih gudang dulu di langkah 1.
                </span>
              )}

              <span className="text-sm text-muted">
                {sheet.rows.length} baris terbaca dari {fileName}
              </span>
            </div>

            {preview && <Counters preview={preview} />}

            {rows.length > 0 && <ImportPreviewTable rows={rows} />}
          </div>
        </Card>
      )}

      {sheet && (
        <Card
          title="3. Konfirmasi"
          description="Produk dibuat satu keluarga per transaksi. Kalau prosesnya terputus di tengah, yang sudah masuk tetap ada dan dilaporkan — jadi jangan tutup halaman ini sampai selesai."
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={commit} disabled={loading || !canCommit}>
              {loading ? <Spinner /> : null}
              Buat semua produk
            </Button>

            {!canCommit && (
              <span className="text-xs text-muted">
                {preview
                  ? "Masih ada baris yang perlu diperbaiki."
                  : "Periksa filenya dulu."}
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * The counters, and they count TWO DIFFERENT THINGS on purpose.
 *
 * Rows are what the user fixes; products are what ends up in the catalogue. A
 * family of twelve rows is thirteen products, so somebody reconciling the import
 * against their catalogue afterwards needs the second number and somebody fixing
 * the file needs the first.
 */
function Counters({
  preview,
}: {
  preview: NonNullable<ReturnType<typeof useProductImport>["preview"]>;
}) {
  const { summary } = preview;
  const problems = summary.rows - summary.ok;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="Baris siap" value={`${summary.ok} / ${summary.rows}`} />
      <Tile
        label="Perlu diperbaiki"
        value={String(problems)}
        tone={problems > 0 ? "bad" : undefined}
      />
      <Tile label="Satuan" value={String(summary.standaloneProducts)} />
      <Tile
        label="Varian"
        value={`${summary.variants} dalam ${summary.families} induk`}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bad";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={
          tone === "bad"
            ? "mt-1 text-lg font-semibold text-destructive"
            : "mt-1 text-lg font-semibold text-foreground"
        }
      >
        {value}
      </p>
    </div>
  );
}
