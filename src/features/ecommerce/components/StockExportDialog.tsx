"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, FileSpreadsheet } from "lucide-react";

import { DataTable, FilterSelect, Pagination, SkuText, Spinner, type DataTableColumn } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { swalToast } from "@/lib/swal";
import { marketplaceService } from "@/services/marketplace.service";
import type {
  MarketplaceStore,
  StockChange,
  StockExportPreview,
  StockExportResult,
  StockExportRow,
} from "@/types/marketplace";
import { saveBlob } from "@/utils/xlsx";

import { ecommerceFailure } from "../errors";
import { MARKETPLACE_LABEL, formatCount, formatDateTime } from "../labels";

const STEPS = ["Pilih toko", "Tinjau", "Selesai"] as const;
const PAGE_SIZE = 25;

/**
 * Ekspor stok — Pilih toko → Tinjau → Selesai.
 *
 * Tahap A's one wizard. The file is the store's saved template with only the
 * Stok cells of bound variations rewritten (stock − buffer, never below 0);
 * every price stays exactly as Shopee sent it. Gudang and buffer come from
 * Pengaturan — choosing another warehouse per export, or a new template inside
 * this dialog, is V2 (BO, 28 Oct 2026).
 *
 * Nothing is recorded until "Buat file". Downloading is not sending: the last
 * step says to upload the file in Seller Center.
 */
export function StockExportDialog({
  stores,
  initialStoreId,
  onClose,
  onExported,
}: {
  stores: MarketplaceStore[];
  initialStoreId: string | null;
  onClose: () => void;
  onExported?: () => void;
}) {
  const ready = useMemo(() => stores.filter((store) => store.template && store.isActive), [stores]);
  const [step, setStep] = useState(1);
  const [storeId, setStoreId] = useState(
    ready.find((store) => store._id === initialStoreId)?._id ?? ready[0]?._id ?? "",
  );
  const store = ready.find((candidate) => candidate._id === storeId) ?? null;

  const [filter, setFilter] = useState<StockChange | "">("");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<StockExportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StockExportResult | null>(null);

  useEffect(() => {
    if (step !== 2 || !storeId) return;
    let active = true;
    // Loading state before the request; the `active` guard makes the late
    // setStates safe — the sanctioned fetch-effect shape (see useWarehouses).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    marketplaceService
      .previewStockExport(storeId, { page, limit: PAGE_SIZE, status: filter })
      .then((next) => {
        if (active) setPreview(next);
      })
      .catch((error) => {
        if (active) swalToast(ecommerceFailure(error, "Tinjauan stok tidak bisa dimuat.").toast, "error", 6000);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [step, storeId, page, filter]);

  const download = async (batchId: string, fileName: string) => {
    const { blob, filename } = await marketplaceService.downloadHistoryFile(batchId, fileName);
    saveBlob(blob, filename);
  };

  const generate = async () => {
    if (!storeId) return;
    setBusy(true);
    try {
      const made = await marketplaceService.generateStockExport(storeId);
      setResult(made);
      setStep(3);
      onExported?.();
      // The file exists from here on; a failed download is retried with
      // "Unduh lagi", not reported as a failed export.
      await download(made.batchId, made.fileName).catch((error) =>
        swalToast(ecommerceFailure(error, "File belum bisa diunduh. Coba Unduh lagi.").toast, "error", 6000),
      );
    } catch (error) {
      swalToast(ecommerceFailure(error, "File stok belum bisa dibuat.").toast, "error", 6000);
    } finally {
      setBusy(false);
    }
  };

  const columns: DataTableColumn<StockExportRow>[] = [
    {
      id: "variant",
      header: "Varian Shopee",
      cell: (row) => (
        <div className="min-w-0">
          <div className="line-clamp-1 font-medium text-foreground">{row.productName}</div>
          <div className="text-xs text-muted">
            {row.variationName ? `${row.variationName} · ` : ""}
            <SkuText value={row.shopeeSku} />
          </div>
        </div>
      ),
    },
    {
      id: "buloo",
      header: "SKU Buloo",
      cell: (row) => (row.product ? <SkuText value={row.product.sku} /> : "—"),
    },
    {
      id: "shopee",
      header: "Stok di Shopee",
      align: "right",
      cell: (row) => <span className="tabular-nums">{row.templateStock ?? "—"}</span>,
    },
    {
      id: "onHand",
      header: "Stok Buloo",
      align: "right",
      cell: (row) => <span className="tabular-nums">{row.onHand}</span>,
    },
    {
      id: "export",
      header: "Stok ditulis",
      align: "right",
      cell: (row) => (
        <span className={cn("tabular-nums", row.change === "changed" && "font-semibold text-foreground")}>
          {row.exportStock}
        </span>
      ),
    },
  ];

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ekspor stok</DialogTitle>
          <DialogDescription>
            File template Shopee dengan kolom Stok diisi dari Buloo. Harga dan kolom lain tidak
            diubah.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-wrap gap-4 text-sm" aria-label="Langkah ekspor stok">
          {STEPS.map((label, index) => {
            const number = index + 1;
            const done = step > number;
            return (
              <li
                key={label}
                aria-current={step === number ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2",
                  step === number ? "font-semibold text-foreground" : "text-muted",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs",
                    done || step === number ? "bg-primary text-primary-foreground" : "bg-tint-neutral",
                  )}
                >
                  {done ? <Check className="size-3.5" aria-hidden /> : number}
                </span>
                {label}
              </li>
            );
          })}
        </ol>

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
                onChange={(id) => {
                  setStoreId(id);
                  setPage(1);
                  setFilter("");
                  setPreview(null);
                }}
              />
              {store ? (
                <dl className="grid gap-3 rounded-xl bg-surface-hover p-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">Gudang sumber</dt>
                    <dd className="font-medium text-foreground">{store.warehouseName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Buffer stok</dt>
                    <dd className="font-medium tabular-nums text-foreground">{store.stockBuffer}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted">Template tersimpan</dt>
                    <dd className="flex items-center gap-2 font-medium text-foreground">
                      <FileSpreadsheet className="size-4 flex-none text-muted" aria-hidden />
                      <span className="min-w-0 break-all">{store.template?.fileName}</span>
                    </dd>
                    <dd className="text-xs text-muted">
                      {formatCount(store.template?.variantCount)} varian · diupload{" "}
                      {formatDateTime(store.template?.uploadedAt)}
                    </dd>
                  </div>
                </dl>
              ) : null}
              <p className="text-sm text-muted">
                Gudang dan buffer diatur di Pengaturan. Template baru diupload di Pengikatan SKU.
              </p>
            </div>
          )
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  { key: "changed", label: "Stok diperbarui", value: preview?.counts.changed },
                  { key: "same", label: "Stok sama", value: preview?.counts.same },
                  { key: null, label: "Belum terikat, tidak diubah", value: preview?.counts.unbound },
                ] as const
              ).map((chip) => {
                const selected = chip.key !== null && filter === chip.key;
                const body = (
                  <>
                    <span className="text-xs text-muted">{chip.label}</span>
                    <span className="text-2xl font-semibold tabular-nums text-foreground">
                      {preview ? formatCount(chip.value) : "…"}
                    </span>
                  </>
                );
                return chip.key === null ? (
                  <div key={chip.label} className="flex flex-col gap-1 rounded-xl border border-border p-3">
                    {body}
                  </div>
                ) : (
                  <button
                    key={chip.label}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setFilter(selected ? "" : chip.key);
                      setPage(1);
                    }}
                    className={cn(
                      "flex min-h-11 flex-col gap-1 rounded-xl border p-3 text-left transition",
                      "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                      selected ? "border-primary bg-navy-100" : "border-border hover:bg-surface-hover",
                    )}
                  >
                    {body}
                  </button>
                );
              })}
            </div>

            {loading && !preview ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : (
              <DataTable
                columns={columns}
                rows={preview?.items ?? []}
                rowKey={(row) => row.listingId}
                loading={loading}
                empty={
                  filter === "changed"
                    ? "Tidak ada stok yang berubah. File tetap bisa dibuat."
                    : "Belum ada varian terikat. Ikat SKU dulu di Pengikatan SKU."
                }
              />
            )}

            {preview && preview.pagination.totalPages > 1 ? (
              <Pagination
                page={preview.pagination.page}
                totalPages={preview.pagination.totalPages}
                total={preview.pagination.total}
                unit="varian"
                onPageChange={setPage}
              />
            ) : null}

            <p className="text-sm text-muted">
              Stok ditulis = stok {store?.warehouseName ?? "gudang"} − buffer {store?.stockBuffer ?? 0},
              minimal 0. Varian yang ditambahkan di Shopee setelah template ini tidak ada di file.
            </p>
          </div>
        ) : null}

        {step === 3 && result ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-xl bg-tint-success p-4">
              <Check className="size-5 flex-none text-success" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold text-foreground">File stok sudah dibuat</p>
                <p className="break-all text-sm text-muted">{result.fileName}</p>
              </div>
            </div>
            <p className="text-sm text-foreground">
              {formatCount(result.counts.changed)} varian berubah stoknya,{" "}
              {formatCount(result.counts.same)} sama, {formatCount(result.counts.unbound)} belum
              terikat dibiarkan.
            </p>
            <p className="text-sm text-muted">
              Upload file ini di Seller Center › Produk Saya › Ubah Massal › Info Penjualan. Stok di
              Shopee baru berubah setelah Shopee selesai memprosesnya.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button type="button" variant="secondary" onClick={onClose}>
                Batal
              </Button>
              <Button type="button" disabled={!store} onClick={() => setStep(2)}>
                Lanjut
              </Button>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setStep(1)} disabled={busy}>
                Kembali
              </Button>
              <Button type="button" onClick={() => void generate()} disabled={busy || !preview}>
                {busy ? "Membuat file…" : "Buat file"}
              </Button>
            </>
          ) : null}
          {step === 3 && result ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  void download(result.batchId, result.fileName).catch((error) =>
                    swalToast(ecommerceFailure(error, "File belum bisa diunduh.").toast, "error", 6000),
                  )
                }
              >
                Unduh lagi
              </Button>
              <Button type="button" onClick={onClose}>
                Selesai
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
