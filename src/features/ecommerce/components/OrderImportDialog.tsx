"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Check } from "lucide-react";

import { Alert, DataTable, FilterSelect, Pagination, type DataTableColumn } from "@/components";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { swalToast } from "@/lib/swal";
import { marketplaceService } from "@/services/marketplace.service";
import type {
  MarketplaceStore,
  OrderImportCategory,
  OrderImportPreview,
  OrderImportResult,
  OrderPreviewItem,
} from "@/types/marketplace";

import { ecommerceFailure } from "../errors";
import {
  ECOMMERCE_HREF,
  ECOMMERCE_SETTINGS_HREF,
  INVOICE_HREF,
  MARKETPLACE_LABEL,
  formatCount,
  formatDateTime,
  formatRupiah,
} from "../labels";
import { FileDropzone } from "./FileDropzone";
import { CountChip, WizardFrame, WizardRow } from "./WizardSteps";

const STEPS = ["Upload", "Tinjau", "Selesai"] as const;
const PAGE_SIZE = 25;

/** The four groups of the review, as the mockup names them. */
const GROUPS: Array<{ key: string; label: string; categories: OrderImportCategory[]; tone?: "warning" }> = [
  { key: "new", label: "Baru, jadi faktur", categories: ["new"] },
  { key: "action", label: "Perlu tindakan", categories: ["held", "needs_action"], tone: "warning" },
  { key: "existing", label: "Sudah ada", categories: ["existing"] },
  { key: "skipped", label: "Dilewati", categories: ["skipped"] },
];

const CATEGORY_LABEL: Record<OrderImportCategory, string> = {
  new: "Baru",
  held: "Perlu tindakan",
  needs_action: "Batal di Shopee",
  existing: "Sudah ada",
  skipped: "Dilewati",
};

/** The mockup's badge per result: navy for what becomes an invoice, orange for a to-do. */
const CATEGORY_TONE: Record<OrderImportCategory, string> = {
  new: "bg-tint-info text-info",
  held: "bg-tint-warning text-warning",
  needs_action: "bg-tint-warning text-warning",
  existing: "bg-tint-neutral text-muted",
  skipped: "bg-tint-neutral text-muted",
};

/** The line under the badge — what happens to this order. */
function resultNote(row: OrderPreviewItem): string {
  if (row.category === "new") return "Jadi faktur, stok terpotong";
  if (row.unboundSkus.length > 0) return `SKU belum terikat: ${row.unboundSkus.join(", ")}`;
  return row.reason ?? "";
}

function itemsText(row: OrderPreviewItem): string {
  const [first] = row.items ?? [];
  if (!first) return `${row.lineCount} barang`;
  const name = [first.productName, first.variationName].filter(Boolean).join(" · ");
  const more = row.items.length > 1 ? `, +${row.items.length - 1} barang lain` : "";
  return `${name} × ${first.qty}${more}`;
}

/**
 * Impor pesanan — Upload → Tinjau → Selesai (Tahap B).
 *
 * Tinjau writes nothing; "Simpan" turns every Baru into an invoice, holds the
 * orders with an unbound SKU, and flags invoiced orders Shopee has since
 * cancelled. Importing the same file again creates nothing.
 */
export function OrderImportDialog({
  stores,
  initialStoreId,
  onClose,
  onDone,
}: {
  stores: MarketplaceStore[];
  initialStoreId: string | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const ready = useMemo(() => stores.filter((store) => store.template && store.isActive), [stores]);
  const [step, setStep] = useState(1);
  const [storeId, setStoreId] = useState(
    ready.find((store) => store._id === initialStoreId)?._id ?? ready[0]?._id ?? "",
  );
  const store = ready.find((candidate) => candidate._id === storeId) ?? null;
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<OrderImportPreview | null>(null);
  const [group, setGroup] = useState<string>("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<OrderImportResult | null>(null);

  const review = async () => {
    if (!store || !file) return;
    setBusy(true);
    try {
      setPreview(await marketplaceService.previewOrders(store._id, file));
      setGroup("");
      setPage(1);
      setStep(2);
    } catch (error) {
      swalToast(ecommerceFailure(error, "File pesanan belum bisa dibaca.").toast, "error", 6000);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!store || !preview) return;
    setBusy(true);
    try {
      const done = await marketplaceService.commitOrders(store._id, preview.batchId);
      setResult(done);
      setStep(3);
      onDone?.();
    } catch (error) {
      swalToast(ecommerceFailure(error, "Pesanan belum bisa disimpan.").toast, "error", 6000);
    } finally {
      setBusy(false);
    }
  };

  const counts = preview?.counts;
  const groupCount = (categories: OrderImportCategory[]) =>
    categories.reduce((sum, category) => sum + (counts?.[category] ?? 0), 0);
  const active = GROUPS.find((candidate) => candidate.key === group);
  const rows = (preview?.items ?? []).filter((item) => !active || active.categories.includes(item.category));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const actionable = counts ? counts.new + counts.held + counts.needs_action : 0;

  const columns: DataTableColumn<OrderPreviewItem>[] = [
    {
      id: "order",
      header: "No. pesanan",
      cell: (row) => (
        <div>
          <div className="font-semibold tabular-nums text-foreground">{row.orderNo}</div>
          <div className="text-sm whitespace-nowrap tabular-nums text-muted">{formatDateTime(row.paidAt)}</div>
        </div>
      ),
    },
    { id: "status", header: "Status Shopee", cell: (row) => <span className="whitespace-nowrap">{row.status}</span> },
    {
      id: "items",
      header: "Barang",
      cell: (row) => <span className="line-clamp-2 max-w-[18rem] text-sm">{itemsText(row)}</span>,
    },
    {
      id: "total",
      header: "Nilai",
      align: "right",
      cell: (row) => <span className="whitespace-nowrap tabular-nums">{formatRupiah(row.total)}</span>,
    },
    {
      id: "result",
      header: "Hasil",
      cell: (row) => (
        <div className="min-w-0 max-w-[16rem]">
          <span
            className={cn(
              "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
              CATEGORY_TONE[row.category],
            )}
          >
            {CATEGORY_LABEL[row.category]}
          </span>
          <div className="mt-1 text-sm text-muted">{resultNote(row)}</div>
        </div>
      ),
    },
  ];

  const summary = result
    ? [
        ["Faktur dibuat", formatCount(result.created.length)],
        ["Pesanan tertahan", formatCount(result.held)],
        ["Ditandai Batal di Shopee", formatCount(result.flagged)],
        ["Sudah ada, dilewati", formatCount(counts?.existing ?? 0)],
        ["Status tidak diimpor", formatCount(counts?.skipped ?? 0)],
      ]
    : [];

  return (
    <WizardFrame
      title="Impor pesanan"
      steps={STEPS}
      current={step}
      busy={busy}
      onClose={onClose}
      note={step === 2 ? "Belum ada yang tersimpan sampai tombol ini ditekan." : undefined}
      footer={
        step === 1 ? (
          <>
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Batal
            </Button>
            <Button type="button" disabled={!store || !file || busy} onClick={() => void review()}>
              {busy ? "Membaca file…" : "Lanjut"}
            </Button>
          </>
        ) : step === 2 ? (
          <>
            <Button type="button" variant="secondary" onClick={() => setStep(1)} disabled={busy}>
              Kembali
            </Button>
            <Button type="button" onClick={() => void commit()} disabled={busy || actionable === 0}>
              {busy ? "Menyimpan…" : `Simpan ${formatCount(counts?.new ?? 0)} faktur`}
            </Button>
          </>
        ) : result && result.held > 0 ? (
          <>
            <Button type="button" variant="secondary" onClick={onClose}>
              Tutup
            </Button>
            <Button asChild type="button">
              <Link href={ECOMMERCE_HREF} onClick={onClose}>
                Lihat pesanan tertahan
              </Link>
            </Button>
          </>
        ) : (
          <Button type="button" onClick={onClose}>
            Tutup
          </Button>
        )
      }
    >
      {step === 1 ? (
        ready.length === 0 ? (
          <p className="text-sm text-muted">
            Belum ada toko aktif dengan template Shopee. Upload template pertama di Pengikatan SKU.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <WizardRow label="Toko">
              <div className="max-w-sm">
                <FilterSelect
                  label="Toko"
                  layout="bar"
                  active={false}
                  className="w-full max-w-none justify-between"
                  value={storeId}
                  options={ready.map((candidate) => ({
                    value: candidate._id,
                    label: `${MARKETPLACE_LABEL[candidate.marketplace]} · ${candidate.name}`,
                  }))}
                  onChange={setStoreId}
                />
              </div>
            </WizardRow>
            <WizardRow label="File" align="start">
              <FileDropzone
                file={file}
                disabled={busy}
                onPick={setFile}
                source="Seller Center › Pesanan Saya › Ekspor"
              />
            </WizardRow>
            <WizardRow label="Status diimpor">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-foreground">
                  {(store?.importStatuses ?? []).join(", ") || "—"}
                </span>
                <Button asChild type="button" variant="secondary" size="sm">
                  <Link href={ECOMMERCE_SETTINGS_HREF} onClick={onClose}>
                    Ubah
                  </Link>
                </Button>
              </div>
            </WizardRow>
          </div>
        )
      ) : null}

      {step === 2 && preview ? (
        <div className="flex flex-col gap-4">
          {preview.warning ? <Alert variant="warning">{preview.warning}</Alert> : null}
          <div className="grid gap-2 sm:grid-cols-4">
            {GROUPS.map((candidate) => (
              <CountChip
                key={candidate.key}
                label={candidate.label}
                value={formatCount(groupCount(candidate.categories))}
                tone={candidate.tone}
                selected={group === candidate.key}
                onClick={() => {
                  setGroup(group === candidate.key ? "" : candidate.key);
                  setPage(1);
                }}
              />
            ))}
          </div>
          <DataTable
            columns={columns}
            rows={shown}
            rowKey={(row) => row.orderNo}
            empty="Tidak ada pesanan di kelompok ini."
          />
          {rows.length > PAGE_SIZE ? (
            <Pagination
              page={page}
              totalPages={Math.ceil(rows.length / PAGE_SIZE)}
              total={rows.length}
              unit="pesanan"
              onPageChange={setPage}
            />
          ) : null}
          <p className="text-sm text-muted">
            Satu pesanan = satu faktur ke pelanggan &quot;Shopee – {store?.name}&quot;. Pesanan dengan
            SKU belum terikat ditahan utuh dan otomatis jadi faktur setelah SKU-nya diikat. Pesanan
            Batal tidak pernah jadi faktur.
          </p>
        </div>
      ) : null}

      {step === 3 && result ? (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-tint-success text-success">
            <Check className="size-6" aria-hidden />
          </span>
          <h3 className="mt-3 text-lg font-bold">{formatCount(result.created.length)} faktur dibuat</h3>
          <dl className="mt-4 w-full max-w-lg divide-y divide-border rounded-xl border border-border text-left text-sm">
            {summary.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 px-4 py-2.5">
                <dt className="text-muted">{label}</dt>
                <dd className="text-right font-semibold tabular-nums text-foreground">{value}</dd>
              </div>
            ))}
            {result.created.length > 0 ? (
              <div className="flex justify-between gap-3 px-4 py-2.5">
                <dt className="flex-none text-muted">Nomor faktur</dt>
                <dd className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-right font-semibold">
                  {result.created.slice(0, 12).map((row) => (
                    <Link
                      key={row.invoiceId}
                      href={INVOICE_HREF(row.invoiceId)}
                      className="tabular-nums text-primary underline"
                    >
                      {row.invoiceNumber}
                    </Link>
                  ))}
                  {result.created.length > 12 ? (
                    <span className="font-normal text-muted">
                      +{result.created.length - 12} lainnya di Penjualan › Faktur
                    </span>
                  ) : null}
                </dd>
              </div>
            ) : null}
          </dl>
          {result.failed.length > 0 ? (
            <div className="mt-4 w-full max-w-lg text-left">
              <Alert variant="error">
                {`${result.failed.length} pesanan gagal: ${result.failed
                  .slice(0, 5)
                  .map((row) => `${row.orderNo} (${row.message})`)
                  .join("; ")}`}
              </Alert>
            </div>
          ) : null}
          {result.held > 0 ? (
            <p className="mt-3 max-w-lg text-sm text-muted">
              Ikat SKU pesanan tertahan di Pengikatan SKU; fakturnya dibuat otomatis.
            </p>
          ) : null}
        </div>
      ) : null}
    </WizardFrame>
  );
}
