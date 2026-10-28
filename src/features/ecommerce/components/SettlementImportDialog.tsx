"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { marketplaceService } from "@/services/marketplace.service";
import type {
  MarketplaceStore,
  SettlementCategory,
  SettlementPreview,
  SettlementPreviewItem,
  SettlementResult,
  StoreAccountRow,
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

const CATEGORIES: Array<{ key: SettlementCategory; label: string; tone?: "warning" }> = [
  { key: "match", label: "Cocok" },
  { key: "variance", label: "Selisih", tone: "warning" },
  { key: "not_found", label: "Faktur tidak ditemukan", tone: "warning" },
  { key: "already_paid", label: "Sudah lunas" },
];

const CATEGORY_LABEL: Record<SettlementCategory, string> = {
  match: "Cocok",
  variance: "Selisih",
  not_found: "Faktur tidak ditemukan",
  already_paid: "Sudah lunas",
};

/**
 * Impor pencairan — Upload → Tinjau → Selesai (Tahap C).
 *
 * The Laporan Penghasilan (sudah dilepas) settles every Cocok and Selisih
 * invoice at once, under one PMT number and one journal entry. A file whose
 * rows do not add up to Total yang Dilepas, or from another seller, is refused
 * before the review. Selisih goes to the store's variance account (V1 has no
 * per-row choice).
 */
export function SettlementImportDialog({
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
  const ready = useMemo(() => stores.filter((store) => store.isActive), [stores]);
  const [step, setStep] = useState(1);
  const [storeId, setStoreId] = useState(
    ready.find((store) => store._id === initialStoreId)?._id ?? ready[0]?._id ?? "",
  );
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [saldo, setSaldo] = useState<StoreAccountRow | null>(null);
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [filter, setFilter] = useState<SettlementCategory | "">("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SettlementResult | null>(null);

  useEffect(() => {
    if (!storeId) return;
    let active = true;
    marketplaceService
      .getAccounts(storeId)
      .then((rows) => {
        if (active) setSaldo(rows.find((row) => row.role === "saldo") ?? null);
      })
      .catch(() => {
        if (active) setSaldo(null);
      });
    return () => {
      active = false;
    };
  }, [storeId]);

  const review = async () => {
    if (!storeId || !file) return;
    setBusy(true);
    try {
      setPreview(await marketplaceService.previewSettlement(storeId, file));
      setFilter("");
      setPage(1);
      setStep(2);
    } catch (error) {
      swalToast(ecommerceFailure(error, "Laporan Penghasilan belum bisa dibaca.").toast, "error", 6000);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!storeId || !preview) return;
    setBusy(true);
    try {
      setResult(await marketplaceService.commitSettlement(storeId, preview.batchId));
      setStep(3);
      onDone?.();
    } catch (error) {
      swalToast(ecommerceFailure(error, "Pencairan belum bisa disimpan.").toast, "error", 6000);
    } finally {
      setBusy(false);
    }
  };

  const settling = preview ? preview.counts.match + preview.counts.variance : 0;
  const rows = (preview?.items ?? []).filter((item) => !filter || item.category === filter);
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const debit = (preview?.journal ?? []).reduce((sum, line) => sum + line.debit, 0);
  const credit = (preview?.journal ?? []).reduce((sum, line) => sum + line.credit, 0);

  const columns: DataTableColumn<SettlementPreviewItem>[] = [
    {
      id: "order",
      header: "No. pesanan",
      cell: (row) => (
        <div>
          <div className="tabular-nums font-medium text-foreground">{row.orderNo}</div>
          {row.invoiceId ? (
            <Link href={INVOICE_HREF(row.invoiceId)} className="text-xs tabular-nums text-primary underline">
              {row.invoiceNumber}
            </Link>
          ) : null}
        </div>
      ),
    },
    {
      id: "invoice",
      header: "Nilai faktur",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums">{row.invoiceValue === null ? "—" : formatRupiah(row.invoiceValue)}</span>
      ),
    },
    {
      id: "report",
      header: "Nilai laporan",
      align: "right",
      cell: (row) => <span className="tabular-nums">{formatRupiah(row.comparisonValue)}</span>,
    },
    {
      id: "released",
      header: "Dana dilepas",
      align: "right",
      cell: (row) => <span className="tabular-nums">{formatRupiah(row.netReleased)}</span>,
    },
    {
      id: "result",
      header: "Hasil",
      cell: (row) => (
        <div className="min-w-0">
          <div
            className={cn(
              "font-medium",
              row.category === "match" ? "text-success" : row.category === "already_paid" ? "text-muted" : "text-warning",
            )}
          >
            {CATEGORY_LABEL[row.category]}
            {row.variance !== 0 ? ` ${formatRupiah(row.variance)}` : ""}
          </div>
          {row.notes.length > 0 ? <div className="text-xs text-muted">{row.notes.join(" · ")}</div> : null}
        </div>
      ),
    },
  ];

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Impor pencairan</DialogTitle>
          <DialogDescription>
            Laporan Penghasilan Shopee (sudah dilepas) melunasi faktur Shopee sekaligus, dengan satu
            nomor PMT dan satu jurnal.
          </DialogDescription>
        </DialogHeader>

        <WizardSteps steps={STEPS} current={step} label="Langkah impor pencairan" />

        {step === 1 ? (
          ready.length === 0 ? (
            <p className="text-sm text-muted">Belum ada toko aktif.</p>
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
                <span className="text-sm font-medium text-foreground">Laporan Penghasilan</span>
                <FileDropzone
                  file={file}
                  disabled={busy}
                  onPick={setFile}
                  source="Seller Center › Keuangan › Penghasilan Saya › Sudah Dilepas › Unduh"
                />
              </div>
              <p className="text-sm text-muted">
                Dana masuk ke{" "}
                <span className="font-medium text-foreground">
                  {saldo ? `${saldo.account.code} ${saldo.account.name}` : "—"}
                </span>{" "}
                ·{" "}
                <Link href={ECOMMERCE_SETTINGS_HREF} className="font-medium text-primary underline">
                  Ubah
                </Link>
              </p>
            </div>
          )
        ) : null}

        {step === 2 && preview ? (
          <div className="flex flex-col gap-4">
            <Alert variant="success">
              {`Total cocok: ${formatCount(preview.items.length)} pesanan = ${formatRupiah(preview.totalReleased)}, sama dengan Total yang Dilepas. Penjual ${preview.username ?? "—"}, periode ${formatDateTime(preview.periodFrom).split(",")[0]} – ${formatDateTime(preview.periodTo).split(",")[0]}.`}
            </Alert>
            <div className="grid gap-3 sm:grid-cols-4">
              {CATEGORIES.map((category) => (
                <CountChip
                  key={category.key}
                  label={category.label}
                  value={formatCount(preview.counts[category.key])}
                  tone={category.tone}
                  selected={filter === category.key}
                  onClick={() => {
                    setFilter(filter === category.key ? "" : category.key);
                    setPage(1);
                  }}
                />
              ))}
            </div>
            <DataTable
              columns={columns}
              rows={shown}
              rowKey={(row) => `${row.orderNo}-${row.releasedAt ?? ""}`}
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

            {preview.journal.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-base font-bold text-foreground">Jurnal yang akan dibuat</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Akun</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Kredit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.journal.map((line) => (
                      <TableRow key={line.role}>
                        <TableCell>
                          <span className="tabular-nums">{line.accountCode}</span> {line.accountName}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {line.debit ? formatRupiah(line.debit) : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {line.credit ? formatRupiah(line.credit) : ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatRupiah(debit)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatRupiah(credit)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            ) : null}
            <p className="text-sm text-muted">
              Faktur Cocok dan Selisih dilunasi penuh. Selisih masuk akun selisih toko. Faktur tidak
              ditemukan dan Sudah lunas dilewati. Belum ada yang tersimpan sampai tombol Simpan
              ditekan.
            </p>
          </div>
        ) : null}

        {step === 3 && result ? (
          <Alert variant="success">
            {`Pencairan ${result.number} tersimpan. ${formatCount(result.settled)} faktur Shopee lunas.`}
          </Alert>
        ) : null}

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
                Batal
              </Button>
              <Button type="button" disabled={!storeId || !file || busy} onClick={() => void review()}>
                {busy ? "Membaca file…" : "Lanjut"}
              </Button>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setStep(1)} disabled={busy}>
                Kembali
              </Button>
              <Button type="button" onClick={() => void commit()} disabled={busy || settling === 0}>
                {busy ? "Menyimpan…" : `Simpan & lunasi ${formatCount(settling)} faktur`}
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
