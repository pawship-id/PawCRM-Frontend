"use client";

import { useState } from "react";
import Link from "next/link";

import {
  Alert,
  Card,
  FilterBar,
  FilterSearch,
  FilterSelect,
  ImportFailedList,
  ImportFilePicker,
  ImportVerdictTable,
  namedOptions,
  Spinner,
  withAll,
  type FilterOption,
  type TemplateFormat,
} from "@/components";
// The shadcn button: only this one takes `asChild`, for the Link below.
import { Button } from "@/components/ui/button";
import type {
  ProductUpdateChange,
  ProductUpdateResult,
  ProductUpdateStatus,
  ProductUpdateTemplateQuery,
  ProductUpdateVerdict,
} from "@/types/productBulkUpdate";
import { formatMoney } from "@/utils/decimal";

import { useCatalogLookups } from "../hooks/useCatalogLookups";
import { useProductBulkUpdate } from "../hooks/useProductBulkUpdate";
import {
  PRODUCT_UPDATE_COLUMNS,
  PRODUCT_UPDATE_MAX,
  saveProductUpdateTemplate,
} from "../utils/productBulkUpdate";

/** What the download narrows to. Opens on whatever the list was showing. */
export interface ProductUpdateFilters {
  search: string;
  categoryId: string;
  productType: "" | "standalone" | "parent";
  status: "" | "active" | "inactive";
}

const LABELS: Record<ProductUpdateStatus, string> = {
  ok: "Siap",
  not_found: "Tidak ditemukan",
  duplicate_in_file: "Ganda di file",
  invalid: "Belum benar",
};

const TYPES = withAll<ProductUpdateFilters["productType"]>(
  [
    { value: "standalone", label: "Satuan" },
    { value: "parent", label: "Varian" },
  ],
  "Semua tipe",
);

const STATUSES: FilterOption<ProductUpdateFilters["status"]>[] = [
  { value: "", label: "Semua status" },
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Nonaktif" },
];

function toTemplateQuery({
  search,
  categoryId,
  productType,
  status,
}: ProductUpdateFilters): ProductUpdateTemplateQuery {
  return {
    ...(search ? { search } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(productType ? { productType } : {}),
    ...(status ? { isActive: status === "active" } : {}),
  };
}

/** A price with sen keeps them: a change of sen must be visible here. */
function shown(field: string, value: string | null): string {
  if (value === null || value === "") return "kosong";
  if (field !== "harga_jual") return value;

  return /\.0+$/.test(value) ? formatMoney(value) : value;
}

function ChangeList({ changes }: { changes: ProductUpdateChange[] }) {
  if (changes.length === 0) return <span className="text-muted">—</span>;

  return (
    <ul className="flex flex-col gap-1">
      {changes.map(({ field, before, after }) => (
        <li key={field}>
          <code className="rounded bg-muted/20 px-1 py-0.5">{field}</code>{" "}
          {shown(field, before)} → {shown(field, after)}
        </li>
      ))}
    </ul>
  );
}

const COLUMNS = [
  {
    header: "Produk",
    cell: (row: ProductUpdateVerdict) => row.productName ?? "—",
  },
  {
    header: "Sebelum → sesudah",
    cell: (row: ProductUpdateVerdict) => <ChangeList changes={row.changes} />,
  },
];

function ResultPanel({
  result,
  onReset,
}: {
  result: ProductUpdateResult;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Alert variant={result.failedCount > 0 ? "warning" : "success"}>
        {result.updatedCount} produk diperbarui
        {result.failedCount > 0 && `, ${result.failedCount} gagal`}.
      </Alert>

      {result.failed.length > 0 && (
        <ImportFailedList
          title="Yang gagal disimpan"
          description="Produk lain sudah tersimpan. Unggah file yang sama lagi: yang sudah masuk tidak akan ditulis dua kali."
          entries={result.failed.map(({ sku, rowNumber, message }) => ({
            label: sku,
            rowNumbers: [rowNumber],
            message,
          }))}
        />
      )}

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/dashboard/inventory/products">Kembali ke produk</Link>
        </Button>
        <Button variant="secondary" onClick={onReset}>
          Unggah file lain
        </Button>
      </div>
    </div>
  );
}

/**
 * Inventori → Produk & Varian → Update Massal.
 *
 * The step is the data, as on the import: no file, then a file with its preview,
 * then a result. The server gives every verdict; this screen shows them and
 * sends the file back.
 *
 * ONLY ROWS THAT SAY SOMETHING ARE LISTED. The whole catalogue may come back with
 * ten edits in it, and the rows that matter must not drown in the rest. The
 * counters say how many were left out.
 */
export function ProductBulkUpdateScreen({
  initialFilters,
}: {
  initialFilters: ProductUpdateFilters;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const { categories } = useCatalogLookups();

  const upload = useProductBulkUpdate();
  const { sheet, preview, rows, canCommit, loading, error, result, progress } =
    upload;

  const patch = (change: Partial<ProductUpdateFilters>) =>
    setFilters((current) => ({ ...current, ...change }));

  const download = async (format: TemplateFormat) => {
    setTemplateError(null);
    setDownloading(true);

    try {
      await saveProductUpdateTemplate(toTemplateQuery(filters), format);
    } catch {
      setTemplateError("Gagal menyiapkan data produk. Coba lagi.");
    } finally {
      setDownloading(false);
    }
  };

  if (result) {
    return <ResultPanel result={result} onReset={upload.reset} />;
  }

  const overLimit = (preview?.summary.changed ?? 0) > PRODUCT_UPDATE_MAX;
  const listed = rows.filter(
    (row) => row.changes.length > 0 || row.problems.length > 0,
  );

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="1. Unduh data, ubah, lalu unggah"
        description="Sel kosong dan nilai yang sama diabaikan, jadi file ini tidak bisa mengosongkan data. SKU tidak bisa diubah. Bundle tidak ikut."
      >
        <div className="flex flex-col gap-4">
          <FilterBar
            searchPlacement="leading"
            searchClassName="min-w-[12rem] flex-1"
            search={
              <FilterSearch
                value={filters.search}
                onChange={(search) => patch({ search })}
                placeholder="Cari nama atau SKU…"
                ariaLabel="Cari produk yang diunduh"
                fill
              />
            }
          >
            <FilterSelect
              label="Tipe"
              ariaLabel="Filter tipe"
              value={filters.productType}
              options={TYPES}
              onChange={(productType) => patch({ productType })}
            />
            <FilterSelect
              label="Kategori"
              ariaLabel="Filter kategori"
              value={filters.categoryId}
              options={withAll(namedOptions(categories), "Semua kategori")}
              onChange={(categoryId) => patch({ categoryId })}
            />
            <FilterSelect
              label="Status"
              ariaLabel="Filter status"
              value={filters.status}
              options={STATUSES}
              onChange={(status) => patch({ status })}
            />
          </FilterBar>

          <ImportFilePicker
            fileName={upload.fileName}
            onPick={upload.pickFile}
            onDownloadTemplate={download}
            disabled={loading || downloading}
            templateLabel="Unduh data produk"
            templateNote={`Kolom yang dibaca: ${PRODUCT_UPDATE_COLUMNS.join(", ")}. Isi akun penjualan dengan kode akun.`}
          />

          {(error || templateError) && (
            <Alert variant="error">{error ?? templateError}</Alert>
          )}

          {downloading && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> Menyiapkan data produk…
            </p>
          )}
        </div>
      </Card>

      {sheet && (
        <Card
          title="2. Periksa sebelum dan sesudah"
          description="Nilai sebelum diambil dari data saat ini. Kalau file sudah lama, cek lagi supaya perubahan orang lain tidak tertimpa."
        >
          <div className="flex flex-col gap-4">
            {sheet.sheetName && (
              <Alert variant="info">
                File ini punya lebih dari satu sheet. Yang dibaca:{" "}
                <strong>{sheet.sheetName}</strong>, sheet pertama.
              </Alert>
            )}

            {sheet.unknownColumns.length > 0 && (
              <Alert variant="warning">
                Kolom ini diabaikan dan tidak akan disimpan:{" "}
                <strong>{sheet.unknownColumns.join(", ")}</strong>.
              </Alert>
            )}

            {loading && (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Spinner />
                {progress
                  ? `Memeriksa ${progress.checked} dari ${progress.total} baris…`
                  : "Menyimpan…"}
              </p>
            )}

            {!preview && !loading && (
              <Button variant="secondary" onClick={upload.check}>
                Periksa ulang
              </Button>
            )}

            {preview && preview.summary.problems > 0 && (
              <Alert variant="error">
                {preview.summary.problems} dari {preview.summary.rows} baris
                perlu diperbaiki. Perbaiki di file, lalu unggah ulang. Belum ada
                yang tersimpan.
              </Alert>
            )}

            {preview && overLimit && (
              <Alert variant="error">
                Ada {preview.summary.changed} produk berubah, sedangkan satu file
                maksimal {PRODUCT_UPDATE_MAX}. Pecah jadi beberapa file.
              </Alert>
            )}

            {preview &&
              preview.summary.problems === 0 &&
              preview.summary.changed === 0 && (
                <Alert variant="info">
                  Tidak ada perubahan di file ini.
                </Alert>
              )}

            {preview && canCommit && (
              <Alert variant="success">
                {preview.summary.changed} produk akan berubah.
                {preview.summary.unchanged > 0 &&
                  ` ${preview.summary.unchanged} baris tidak berubah.`}
              </Alert>
            )}

            {preview && listed.length > 0 && (
              <ImportVerdictTable
                rows={listed}
                statusLabels={LABELS}
                extraColumns={COLUMNS}
              />
            )}
          </div>
        </Card>
      )}

      {sheet && (
        <Card
          title="3. Simpan"
          description="Produk disimpan satu per satu. Jangan tutup halaman ini sampai selesai. Kalau terputus, yang sudah masuk tetap tersimpan."
        >
          <Button onClick={upload.commit} disabled={!canCommit || loading}>
            {canCommit && preview
              ? `Simpan ${preview.summary.changed} produk`
              : "Simpan perubahan"}
          </Button>
        </Card>
      )}
    </div>
  );
}
