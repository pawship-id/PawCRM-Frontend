"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Alert, DataTable, FilterSelect, Pagination, type DataTableColumn } from "@/components";
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
  ECOMMERCE_SETTINGS_HREF,
  INVOICE_HREF,
  MARKETPLACE_LABEL,
  formatCount,
  formatDateTime,
  formatRupiah,
} from "../labels";
import { FileDropzone } from "./FileDropzone";
import { CountChip, WizardSteps } from "./WizardSteps";

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
  held: "Ditahan",
  needs_action: "Batal di Shopee",
  existing: "Sudah ada",
  skipped: "Dilewati",
};

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
      cell: (row) => <span className="tabular-nums font-medium text-foreground">{row.orderNo}</span>,
    },
    { id: "status", header: "Status Shopee", cell: (row) => row.status },
    {
      id: "paid",
      header: "Dibayar",
      cell: (row) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(row.paidAt)}</span>,
    },
    {
      id: "total",
      header: "Nilai faktur",
      align: "right",
      cell: (row) => <span className="tabular-nums">{formatRupiah(row.total)}</span>,
    },
    {
      id: "result",
      header: "Hasil",
      cell: (row) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground">{CATEGORY_LABEL[row.category]}</div>
          <div className="text-xs text-muted">
            {row.unboundSkus.length > 0
              ? `SKU belum terikat: ${row.unboundSkus.join(", ")}`
              : row.reason ?? `${row.lineCount} barang`}
          </div>
        </div>
      ),
    },
  ];

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Impor pesanan</DialogTitle>
          <DialogDescription>
            File Order dari Shopee jadi faktur. Satu pesanan = satu faktur ke pelanggan &quot;Shopee
            – nama toko&quot;.
          </DialogDescription>
        </DialogHeader>

        <WizardSteps steps={STEPS} current={step} label="Langkah impor pesanan" />

        {step === 1 ? (
          ready.length === 0 ? (
            <p className="text-sm text-muted">
              Belum ada toko aktif dengan template Shopee. Upload template pertama di Pengikatan SKU.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <FilterSelect
                label="Toko"
                layout="form"
                active={false}
                value={storeId}
                options={ready.map((candidate) => ({
                  value: candidate._id,
                  label: `${MARKETPLACE_LABEL[candidate.marketplace]} · ${candidate.name}`,
                }))}
                onChange={setStoreId}
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">File pesanan</span>
                <FileDropzone
                  file={file}
                  disabled={busy}
                  onPick={setFile}
                  source="Seller Center › Pesanan Saya › Export (Order.all…xlsx)"
                />
              </div>
              <p className="text-sm text-muted">
                Status yang jadi faktur: {(store?.importStatuses ?? []).join(", ") || "—"} ·{" "}
                <Link href={ECOMMERCE_SETTINGS_HREF} className="font-medium text-primary underline">
                  Ubah
                </Link>
              </p>
            </div>
          )
        ) : null}

        {step === 2 && preview ? (
          <div className="flex flex-col gap-4">
            {preview.warning ? <Alert variant="warning">{preview.warning}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-4">
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
              Pesanan dengan SKU belum terikat ditahan utuh dan otomatis jadi faktur setelah SKU-nya
              diikat. Pesanan Batal tidak pernah jadi faktur. Belum ada yang tersimpan sampai tombol
              Simpan ditekan.
            </p>
          </div>
        ) : null}

        {step === 3 && result ? (
          <div className="flex flex-col gap-3 text-sm">
            <Alert variant="success">
              {`${formatCount(result.created.length)} faktur dibuat, ${formatCount(result.held)} pesanan ditahan, ${formatCount(result.flagged)} ditandai Batal di Shopee.`}
            </Alert>
            {result.created.length > 0 ? (
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {result.created.slice(0, 12).map((row) => (
                  <li key={row.invoiceId}>
                    <Link href={INVOICE_HREF(row.invoiceId)} className="tabular-nums text-primary underline">
                      {row.invoiceNumber}
                    </Link>
                  </li>
                ))}
                {result.created.length > 12 ? (
                  <li className="text-muted">+{result.created.length - 12} lainnya di Penjualan › Faktur</li>
                ) : null}
              </ul>
            ) : null}
            {result.failed.length > 0 ? (
              <Alert variant="error">
                {`${result.failed.length} pesanan gagal: ${result.failed
                  .slice(0, 5)
                  .map((row) => `${row.orderNo} (${row.message})`)
                  .join("; ")}`}
              </Alert>
            ) : null}
            {result.held > 0 ? (
              <p className="text-muted">
                Pesanan tertahan ada di Ringkasan. Ikat SKU-nya di Pengikatan SKU, fakturnya dibuat
                otomatis.
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
                Batal
              </Button>
              <Button type="button" disabled={!store || !file || busy} onClick={() => void review()}>
                {busy ? "Membaca file…" : "Lanjut"}
              </Button>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setStep(1)} disabled={busy}>
                Kembali
              </Button>
              <Button type="button" onClick={() => void commit()} disabled={busy || actionable === 0}>
                {busy ? "Menyimpan…" : `Simpan ${formatCount(counts?.new ?? 0)} faktur`}
              </Button>
            </>
          ) : null}
          {step === 3 ? (
            <Button type="button" onClick={onClose}>
              Selesai
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
