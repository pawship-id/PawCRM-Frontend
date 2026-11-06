"use client";

import Link from "next/link";
import { useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { swalToast } from "@/lib/swal";
import { marketplaceService } from "@/services/marketplace.service";
import type { Marketplace, MarketplaceHistoryEntry } from "@/types/marketplace";
import { saveBlob } from "@/utils/xlsx";

import { ecommerceFailure } from "../errors";
import {
  INVOICE_HREF,
  PROCESS_LABEL,
  SETTLEMENT_HREF,
  formatCount,
  formatDateTime,
  marketplaceProfile,
} from "../labels";

/** The figures a history row reported, in reading order, by process. */
function resultRows(entry: MarketplaceHistoryEntry, short: string): Array<[string, string]> {
  const r = entry.result;
  if (entry.process === "template") {
    return [
      ["Varian dibaca", formatCount(r.variants)],
      ["Produk", formatCount(r.products)],
      ["Langsung terikat (SKU sama)", formatCount(r.autoBound)],
      ["Terikat setelah upload", formatCount(r.bound)],
      ["Saran", formatCount(r.suggested ?? 0)],
      ["Belum terikat", formatCount(r.unbound)],
      [`Tanpa SKU di ${short}`, formatCount(r.noSku)],
      ["Hilang dari template", formatCount(r.removed)],
    ];
  }
  if (entry.process === "orders") {
    return [
      ["Faktur dibuat", formatCount(r.created)],
      ["Sudah ada, dilewati", formatCount(r.existing)],
      ["Pesanan tertahan", formatCount(r.held)],
      ["Status tidak diimpor", formatCount(r.skipped)],
      ...whenAny(`Ditandai Batal di ${short}`, r.flagged),
      ...whenAny("Gagal", r.failed),
    ];
  }
  if (entry.process === "settlement") {
    return [
      ["Faktur lunas", formatCount(r.settled)],
      ["Cocok", formatCount(r.match)],
      ["Selisih", formatCount(r.variance)],
      ["Faktur tidak ditemukan", formatCount(r.not_found)],
      ["Sudah lunas", formatCount(r.already_paid)],
      ...whenAny("Batal, tanpa faktur", r.cancelled),
      ...whenAny("Penyesuaian dicatat", r.adjusted),
      ...whenAny(`Ditandai Batal di ${short}`, r.flagged),
    ];
  }
  return [
    ["Template", r.templateFileName ?? "—"],
    ["Stok diperbarui", `${formatCount(r.changed)} varian`],
    ["Stok sama", `${formatCount(r.same)} varian`],
    ["Belum terikat, tidak diubah", `${formatCount(r.unbound)} varian`],
    ["Buffer stok", formatCount(r.stockBuffer)],
  ];
}

/** A row that only exists when it happened — most imports flag and fail nothing. */
const whenAny = (label: string, value: number | undefined): Array<[string, string]> =>
  value ? [[label, formatCount(value)]] : [];

const SECTION_HEADING = "text-xs font-semibold tracking-wide text-muted";

/** Detail riwayat — what one run did, the documents it made, and an export's file again. */
export function HistoryDetailDialog({
  entry,
  storeName,
  marketplace,
  onClose,
}: {
  entry: MarketplaceHistoryEntry;
  storeName: string;
  marketplace?: Marketplace;
  onClose: () => void;
}) {
  const profile = marketplaceProfile(marketplace);
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const { blob, filename } = await marketplaceService.downloadHistoryFile(
        entry._id,
        entry.fileName ?? "ekspor-stok.xlsx",
      );
      saveBlob(blob, filename);
    } catch (error) {
      swalToast(ecommerceFailure(error, "File belum bisa diunduh.").toast, "error", 6000);
    } finally {
      setDownloading(false);
    }
  };

  const documents = entry.documents ?? [];

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] gap-5 overflow-y-auto sm:max-w-xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Detail riwayat</DialogTitle>
        </DialogHeader>

        <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 rounded-xl border border-border bg-surface-hover p-4 text-sm">
          <dt className="text-muted">Proses</dt>
          <dd className="font-semibold text-foreground">{PROCESS_LABEL[entry.process]}</dd>
          <dt className="text-muted">Toko</dt>
          <dd className="font-semibold text-foreground">
            {profile.short} · {storeName}
          </dd>
          <dt className="text-muted">Waktu</dt>
          <dd className="font-semibold tabular-nums text-foreground">{formatDateTime(entry.createdAt)}</dd>
          <dt className="text-muted">Oleh</dt>
          <dd className="font-semibold text-foreground">{entry.createdByName ?? "—"}</dd>
          <dt className="text-muted">File</dt>
          <dd className="font-semibold break-all text-foreground">{entry.fileName ?? "—"}</dd>
        </dl>

        <section className="space-y-3 border-t border-border pt-4">
          <h3 className={SECTION_HEADING}>Hasil</h3>
          <dl className="divide-y divide-border rounded-xl border border-border text-sm">
            {resultRows(entry, profile.short).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 px-4 py-2.5">
                <dt className="text-foreground">{label}</dt>
                <dd className="text-right font-semibold break-all tabular-nums text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {(entry.process === "orders" || entry.process === "settlement") && documents.length > 0 ? (
          <section className="space-y-3 border-t border-border pt-4">
            <h3 className={SECTION_HEADING}>
              {entry.process === "settlement" ? "Pembayaran dibuat" : "Faktur dibuat"}
            </h3>
            <ul className="divide-y divide-border border-t border-border">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-sm font-medium tabular-nums text-foreground">{doc.number}</span>
                  <Button asChild type="button" variant="secondary" size="sm">
                    <Link href={doc.kind === "marketplace_settlement" ? SETTLEMENT_HREF(doc.id) : INVOICE_HREF(doc.id)}>
                      Buka
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {entry.process === "stock_export" && entry.fileId ? (
          <section className="space-y-3 border-t border-border pt-4">
            <h3 className={SECTION_HEADING}>File</h3>
            <Button type="button" variant="secondary" size="sm" onClick={() => void download()} disabled={downloading}>
              <Download className="size-4" aria-hidden />
              {downloading ? "Mengunduh…" : "Unduh ulang file"}
            </Button>
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
