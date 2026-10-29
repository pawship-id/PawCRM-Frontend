"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";

import { DataTable, FilterSelect, Pagination, SkuText, Spinner, type DataTableColumn } from "@/components";
import { Button } from "@/components/ui/button";
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
import { MARKETPLACE_LABEL, formatCount, formatDateTime, formatTemplatePrice } from "../labels";
import { CountChip, FileChip, WizardFrame, WizardRow } from "./WizardSteps";

const STEPS = ["Upload", "Tinjau", "Selesai"] as const;
const PAGE_SIZE = 25;

/**
 * Ekspor stok — Upload → Tinjau → Selesai, laid out as the mockup's wizard.
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
      header: "Varian",
      cell: (row) => (
        <div className="min-w-0 max-w-[28rem]">
          <div className="line-clamp-1 font-semibold text-foreground">{row.productName}</div>
          <div className="text-sm text-muted">
            {row.variationName ? `${row.variationName} · ` : ""}
            <span className="text-primary">
              <SkuText value={row.shopeeSku} />
            </span>
          </div>
        </div>
      ),
    },
    {
      id: "shopee",
      header: "Stok di Shopee",
      align: "right",
      cell: (row) => <span className="tabular-nums">{row.templateStock ?? "—"}</span>,
    },
    {
      id: "export",
      header: "Stok ditulis",
      align: "right",
      cell: (row) => {
        const up = row.templateStock !== null && row.exportStock > row.templateStock;
        const down = row.templateStock !== null && row.exportStock < row.templateStock;
        return (
          <span
            className={cn(
              "tabular-nums",
              up && "font-semibold text-success",
              down && "font-semibold text-danger",
            )}
          >
            {row.exportStock}
          </span>
        );
      },
    },
    {
      id: "price",
      header: "Harga ditulis",
      cell: (row) => (
        <span className="text-sm text-muted">
          <span className="tabular-nums">{formatTemplatePrice(row.templatePrice)}</span> · tetap
        </span>
      ),
    },
  ];

  const bound = preview ? preview.counts.changed + preview.counts.same : 0;
  const summary = result
    ? [
        ["File", <span key="file" className="break-all">{result.fileName}</span>],
        ["Gudang sumber", store?.warehouseName ?? "—"],
        ["Template", `Template tersimpan ${formatDateTime(store?.template?.uploadedAt)}`],
        ["Stok diperbarui", `${formatCount(result.counts.changed)} varian`],
        ["Stok sama", `${formatCount(result.counts.same)} varian`],
        ["Belum terikat, tidak diubah", `${formatCount(result.counts.unbound)} varian`],
      ]
    : [];

  return (
    <WizardFrame
      title="Ekspor stok"
      steps={STEPS}
      current={step}
      busy={busy}
      onClose={onClose}
      note={step === 2 ? "Belum ada yang tersimpan sampai tombol ini ditekan." : undefined}
      footer={
        step === 1 ? (
          <>
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="button" disabled={!store} onClick={() => setStep(2)}>
              Lanjut
            </Button>
          </>
        ) : step === 2 ? (
          <>
            <Button type="button" variant="secondary" onClick={() => setStep(1)} disabled={busy}>
              Kembali
            </Button>
            <Button type="button" onClick={() => void generate()} disabled={busy || !preview}>
              {busy ? "Membuat file…" : "Buat file"}
            </Button>
          </>
        ) : result ? (
          <>
            <Button type="button" variant="secondary" onClick={onClose}>
              Tutup
            </Button>
            <Button
              type="button"
              onClick={() =>
                void download(result.batchId, result.fileName).catch((error) =>
                  swalToast(ecommerceFailure(error, "File belum bisa diunduh.").toast, "error", 6000),
                )
              }
            >
              Unduh file
            </Button>
          </>
        ) : null
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
                  onChange={(id) => {
                    setStoreId(id);
                    setPage(1);
                    setFilter("");
                    setPreview(null);
                  }}
                />
              </div>
            </WizardRow>
            {store ? (
              <>
                <WizardRow label="Gudang sumber">
                  <p className="font-semibold text-foreground">
                    {store.warehouseName ?? "—"}
                    <span className="font-normal text-muted"> · buffer {store.stockBuffer}</span>
                  </p>
                </WizardRow>
                <WizardRow label="Template" align="start">
                  <FileChip
                    title="Template tersimpan"
                    detail={`${store.template?.fileName} · ${formatCount(store.template?.variantCount)} varian · diupload ${formatDateTime(store.template?.uploadedAt)}`}
                  />
                </WizardRow>
                <p className="text-sm text-muted">
                  Gudang dan buffer diatur di Pengaturan. Template baru diupload di Pengikatan SKU.
                </p>
              </>
            ) : null}
          </div>
        )
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <CountChip
              label="Stok diperbarui"
              value={preview ? formatCount(preview.counts.changed) : "…"}
              selected={filter === "changed"}
              onClick={() => {
                setFilter(filter === "changed" ? "" : "changed");
                setPage(1);
              }}
            />
            <CountChip
              label="Stok sama"
              value={preview ? formatCount(preview.counts.same) : "…"}
              selected={filter === "same"}
              onClick={() => {
                setFilter(filter === "same" ? "" : "same");
                setPage(1);
              }}
            />
            <CountChip
              label="Belum terikat, tidak diubah"
              value={preview ? formatCount(preview.counts.unbound) : "…"}
            />
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

          {preview ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
              <span>
                {formatCount(preview.pagination.total)} dari {formatCount(bound)} varian terikat
              </span>
              {preview.pagination.totalPages > 1 ? (
                <Pagination
                  page={preview.pagination.page}
                  totalPages={preview.pagination.totalPages}
                  total={preview.pagination.total}
                  unit="varian"
                  onPageChange={setPage}
                />
              ) : null}
            </div>
          ) : null}

          <p className="text-sm text-muted">
            Stok ditulis = stok {store?.warehouseName ?? "gudang"} − buffer {store?.stockBuffer ?? 0},
            minimal 0. Hanya kolom Stok yang diisi ulang; harga dan kolom lain tetap seperti di
            template. Varian yang ditambahkan di Shopee setelah template ini tidak ada di file.
          </p>
        </div>
      ) : null}

      {step === 3 && result ? (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-tint-success text-success">
            <Check className="size-6" aria-hidden />
          </span>
          <h3 className="mt-3 text-lg font-bold">File siap diupload ke Shopee</h3>
          <p className="mt-1 text-sm text-muted">
            File sudah diunduh. Upload di Seller Center › Produk Saya › Ubah Massal.
          </p>
          <dl className="mt-4 w-full max-w-lg divide-y divide-border rounded-xl border border-border text-left text-sm">
            {summary.map(([label, value]) => (
              <div key={label as string} className="flex justify-between gap-3 px-4 py-2.5">
                <dt className="text-muted">{label}</dt>
                <dd className="text-right font-semibold text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </WizardFrame>
  );
}
