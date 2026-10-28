"use client";

import Link from "next/link";
import { useState } from "react";
import { Download } from "lucide-react";

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
import type { MarketplaceHistoryEntry } from "@/types/marketplace";
import { saveBlob } from "@/utils/xlsx";

import { ecommerceFailure } from "../errors";
import { INVOICE_HREF, PROCESS_LABEL, formatCount, formatDateTime } from "../labels";

/** The figures a history row reported, in reading order, by process. */
function resultRows(entry: MarketplaceHistoryEntry): Array<[string, string]> {
  const r = entry.result;
  if (entry.process === "template") {
    return [
      ["Varian dibaca", formatCount(r.variants)],
      ["Produk", formatCount(r.products)],
      ["Langsung terikat (SKU sama)", formatCount(r.autoBound)],
      ["Terikat setelah upload", formatCount(r.bound)],
      ["Belum terikat", formatCount(r.unbound)],
      ["Tanpa SKU di Shopee", formatCount(r.noSku)],
      ["Hilang dari template", formatCount(r.removed)],
    ];
  }
  if (entry.process === "orders") {
    return [
      ["Faktur dibuat", formatCount(r.created)],
      ["Ditahan (SKU belum terikat)", formatCount(r.held)],
      ["Ditandai Batal di Shopee", formatCount(r.flagged)],
      ["Sudah ada", formatCount(r.existing)],
      ["Dilewati", formatCount(r.skipped)],
      ["Gagal", formatCount(r.failed)],
    ];
  }
  if (entry.process === "settlement") {
    return [
      ["Nomor pencairan", r.number ?? "—"],
      ["Faktur dilunasi", formatCount(r.settled)],
      ["Cocok", formatCount(r.match)],
      ["Selisih", formatCount(r.variance)],
      ["Faktur tidak ditemukan", formatCount(r.not_found)],
      ["Sudah lunas", formatCount(r.already_paid)],
    ];
  }
  return [
    ["Stok diperbarui", formatCount(r.changed)],
    ["Stok sama", formatCount(r.same)],
    ["Belum terikat, tidak diubah", formatCount(r.unbound)],
    ["Buffer stok", formatCount(r.stockBuffer)],
    ["Dari template", r.templateFileName ?? "—"],
  ];
}

/** Detail riwayat — what one upload or export did, and its file again. */
export function HistoryDetailDialog({
  entry,
  storeName,
  onClose,
}: {
  entry: MarketplaceHistoryEntry;
  storeName: string;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const { blob, filename } = await marketplaceService.downloadHistoryFile(
        entry._id,
        entry.fileName ?? "shopee.xlsx",
      );
      saveBlob(blob, filename);
    } catch (error) {
      swalToast(ecommerceFailure(error, "File belum bisa diunduh.").toast, "error", 6000);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{PROCESS_LABEL[entry.process]}</DialogTitle>
          <DialogDescription>
            {storeName} · {formatDateTime(entry.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-xl bg-surface-hover p-4 text-sm">
          {resultRows(entry).map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right tabular-nums text-foreground">{value}</dd>
            </div>
          ))}
        </dl>

        {entry.fileName ? <p className="break-all text-sm text-muted">File: {entry.fileName}</p> : null}
        {entry.process === "orders" && (entry.documents?.length ?? 0) > 0 ? (
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Faktur yang dibuat</span>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {(entry.documents ?? []).slice(0, 30).map((doc) => (
                <li key={doc.id}>
                  <Link href={INVOICE_HREF(doc.id)} className="tabular-nums text-primary underline">
                    {doc.number}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {entry.process === "stock_export" ? (
          <p className="text-sm text-muted">
            Mengunduh tidak sama dengan terkirim. Stok di Shopee berubah setelah file ini diupload di
            Seller Center.
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          {entry.fileId ? (
            <Button type="button" onClick={() => void download()} disabled={downloading}>
              <Download className="size-4" aria-hidden />
              {downloading ? "Mengunduh…" : "Unduh ulang"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
