"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";

import { DataTable, FilterSelect, Pagination, type DataTableColumn } from "@/components";
import { Button } from "@/components/ui/button";
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
  SETTLEMENT_HREF,
  formatCount,
  formatDate,
  formatRupiah,
} from "../labels";
import { FileDropzone } from "./FileDropzone";
import { CountChip, WizardFrame, WizardRow } from "./WizardSteps";

const STEPS = ["Upload", "Tinjau", "Selesai"] as const;
const PAGE_SIZE = 25;

const CATEGORIES: Array<{ key: SettlementCategory; label: string; tone?: "warning" | "danger" }> = [
  { key: "match", label: "Cocok" },
  { key: "variance", label: "Selisih", tone: "warning" },
  { key: "not_found", label: "Faktur tidak ditemukan", tone: "danger" },
  { key: "already_paid", label: "Sudah lunas" },
];

const CATEGORY_LABEL: Record<SettlementCategory, string> = {
  match: "Cocok",
  variance: "Selisih",
  not_found: "Faktur tidak ditemukan",
  already_paid: "Sudah lunas",
};

const CATEGORY_TONE: Record<SettlementCategory, string> = {
  match: "bg-tint-success text-success",
  variance: "bg-tint-warning text-warning",
  not_found: "bg-tint-danger text-danger",
  already_paid: "bg-tint-neutral text-muted",
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
  const journal = preview?.journal ?? [];
  const debit = journal.reduce((sum, line) => sum + line.debit, 0);
  const credit = journal.reduce((sum, line) => sum + line.credit, 0);
  const rowsTotal = (preview?.items ?? []).reduce((sum, item) => sum + item.netReleased, 0);
  const signedLine = (role: string) => {
    const line = journal.find((candidate) => candidate.role === role);
    return line ? line.debit - line.credit : 0;
  };
  const varianceLine = journal.find((line) => line.role === "variance");
  const saldoLabel = saldo ? `${saldo.account.code} ${saldo.account.name}` : "—";

  const columns: DataTableColumn<SettlementPreviewItem>[] = [
    {
      id: "order",
      header: "No. pesanan",
      cell: (row) => (
        <div>
          <div className="font-semibold tabular-nums text-foreground">{row.orderNo}</div>
          <div className="text-sm whitespace-nowrap tabular-nums text-muted">
            {row.invoiceId ? (
              <>
                <Link href={INVOICE_HREF(row.invoiceId)} className="text-primary underline">
                  {row.invoiceNumber}
                </Link>{" "}
                ·{" "}
              </>
            ) : null}
            dilepas {formatDate(row.releasedAt)}
          </div>
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
      id: "deductions",
      header: "Potongan",
      align: "right",
      cell: (row) => <span className="tabular-nums">{formatRupiah(row.deductions)}</span>,
    },
    {
      id: "pph22",
      header: "PPh 22",
      align: "right",
      cell: (row) => <span className="tabular-nums">{formatRupiah(row.pph22)}</span>,
    },
    {
      id: "released",
      header: "Dana cair",
      align: "right",
      cell: (row) => <span className="font-semibold tabular-nums">{formatRupiah(row.netReleased)}</span>,
    },
    {
      id: "result",
      header: "Hasil",
      cell: (row) => (
        <div className="min-w-0 max-w-[15rem]">
          <span
            className={cn(
              "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
              CATEGORY_TONE[row.category],
            )}
          >
            {CATEGORY_LABEL[row.category]}
          </span>
          {row.notes.length > 0 || row.variance !== 0 ? (
            <div className="mt-1 text-sm text-muted">
              {[...row.notes, ...(row.variance !== 0 ? [`Selisih ${formatRupiah(row.variance)}`] : [])].join(" · ")}
            </div>
          ) : null}
        </div>
      ),
    },
  ];

  const deductions = signedLine("admin") + signedLine("program") + signedLine("shipping");
  const summary: Array<[string, string]> = preview
    ? [
        ["Faktur lunas", formatCount(result?.settled)],
        [`Dana masuk ke ${saldoLabel}`, formatRupiah(preview.settlingReleased)],
        ["Potongan marketplace", formatRupiah(deductions)],
        ["PPh 22", formatRupiah(signedLine("pph22"))],
        ...(varianceLine
          ? ([
              [
                `Selisih ke ${varianceLine.accountCode} ${varianceLine.accountName}`,
                formatRupiah(Math.abs(signedLine("variance"))),
              ],
            ] as Array<[string, string]>)
          : []),
        ...(preview.counts.not_found > 0
          ? ([["Dilewati, faktur tidak ditemukan", formatCount(preview.counts.not_found)]] as Array<[string, string]>)
          : []),
      ]
    : [];

  return (
    <WizardFrame
      title="Impor pencairan"
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
            <Button type="button" disabled={!storeId || !file || busy} onClick={() => void review()}>
              {busy ? "Membaca file…" : "Lanjut"}
            </Button>
          </>
        ) : step === 2 ? (
          <>
            <Button type="button" variant="secondary" onClick={() => setStep(1)} disabled={busy}>
              Kembali
            </Button>
            <Button type="button" onClick={() => void commit()} disabled={busy || settling === 0}>
              {busy ? "Menyimpan…" : `Lunasi ${formatCount(settling)} faktur`}
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
          <p className="text-sm text-muted">Belum ada toko aktif.</p>
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
                source="Seller Center › Keuangan › Penghasilan Saya › Laporan Penghasilan"
              />
            </WizardRow>
            <WizardRow label="Dana masuk ke">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-foreground">{saldoLabel}</span>
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-tint-success px-4 py-2.5 text-sm text-foreground">
            <span>
              Total yang Dilepas di file{" "}
              <b className="tabular-nums">{formatRupiah(preview.totalReleased)}</b>
            </span>
            <span className="text-muted">·</span>
            <span>
              Jumlah {formatCount(preview.items.length)} baris{" "}
              <b className="tabular-nums">{formatRupiah(rowsTotal)}</b>
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-success">
              <Check className="size-4" aria-hidden />
              Cocok
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
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

          {journal.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-base font-bold text-foreground">Jurnal yang akan dibuat</h3>
              <div className="overflow-hidden rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Akun</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Kredit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {journal.map((line) => (
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
            </div>
          ) : null}
          <p className="text-sm text-muted">
            Penjual {preview.username ?? "—"}, periode {formatDate(preview.periodFrom)} –{" "}
            {formatDate(preview.periodTo)}. Faktur tidak ditemukan dan Sudah lunas dilewati, dananya
            tidak ikut dijurnal.
          </p>
        </div>
      ) : null}

      {step === 3 && result ? (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-tint-success text-success">
            <Check className="size-6" aria-hidden />
          </span>
          <h3 className="mt-3 text-lg font-bold">{formatCount(result.settled)} faktur lunas</h3>
          <p className="mt-1 text-sm text-muted">
            {formatRupiah(preview?.settlingReleased)} masuk ke {saldoLabel}
          </p>
          <dl className="mt-4 w-full max-w-lg divide-y divide-border rounded-xl border border-border text-left text-sm">
            <div className="flex justify-between gap-3 px-4 py-2.5">
              <dt className="text-muted">Pembayaran</dt>
              <dd className="text-right font-semibold">
                <Link href={SETTLEMENT_HREF(result.settlementId)} className="tabular-nums text-primary underline">
                  {result.number}
                </Link>
              </dd>
            </div>
            {summary.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 px-4 py-2.5">
                <dt className="text-muted">{label}</dt>
                <dd className="text-right font-semibold tabular-nums text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </WizardFrame>
  );
}
