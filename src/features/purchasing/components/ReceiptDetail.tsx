"use client";

import { SkuText } from "@/components/SkuText";
import { useState } from "react";
import Link from "next/link";

import { Alert, Card, ConfirmDialog, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { formatMoney, formatQty, sumDecimals, toMinor } from "@/utils/decimal";
import { Can } from "@/features/permissions";
import { ExpiryBadge } from "@/features/inventory/components/ExpiryBadge";
import type { GoodsReceiptDetail as Receipt } from "@/types/api";

import { useGoodsReceipt } from "../hooks/useGoodsReceipt";
import { useReceiptLots } from "../hooks/useReceiptLots";
import { useReceiptReturns } from "../hooks/useReceiptReturns";
import { PURCHASING_CRUMBS } from "../crumbs";
import { PageHeading } from "./PageHeading";
import { PurchaseActivityCard } from "./PurchaseActivityCard";
import {
  ReceiptLineStatusBadge,
  ReceiptStatusBadge,
} from "./ReceiptStatusBadge";
import { SupplierTypeBadge } from "./SupplierTypeBadge";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * One goods receipt: what was ordered, how much of it has arrived, and what it
 * set in motion.
 *
 * RECEIVING IS PER LINE (14 October 2026, BO). A delivery is filed `pending`,
 * received over as many visits to the receiving PAGE as the goods take — each a
 * receiving event that posts only the difference — and ends `received` (all of
 * it) or `closed` (the rest will not come). While `partial`, a received
 * quantity may still be corrected, up or down, on that page.
 *
 * THE LINES NEVER CHANGE HERE. What was ordered is fixed when the receipt is
 * filed — copied from the supplier invoice when it came from one — and only how
 * much of it arrived moves. A wrong delivery after it is complete is a return.
 */
export function ReceiptDetail({ receiptId }: { receiptId: string }) {
  const { receipt, loading, error, notFound, refetch } =
    useGoodsReceipt(receiptId);

  if (loading && !receipt) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat detail penerimaan…
      </div>
    );
  }

  if (notFound) {
    return (
      <Card className="text-center">
        <p className="text-sm font-medium text-foreground">
          Penerimaan tidak ditemukan.
        </p>
        <p className="mt-1 text-sm text-muted">
          Nomor ini tidak ada, atau bukan milik tenant Anda.
        </p>
        <Button variant="secondary" asChild className="mt-4">
          <Link href="/dashboard/purchasing/receipts">← Semua penerimaan</Link>
        </Button>
      </Card>
    );
  }

  if (error || !receipt) {
    return (
      <Alert variant="error">
        {error ?? "Gagal memuat detail penerimaan."}{" "}
        <button
          type="button"
          onClick={refetch}
          className="font-medium underline underline-offset-2"
        >
          Coba lagi
        </button>
      </Alert>
    );
  }

  return <ReceiptBody receipt={receipt} onChanged={refetch} />;
}

/**
 * Split from the guard clauses above so the hooks that decorate a LOADED receipt
 * — its lots, its returns — are not called conditionally.
 */
function ReceiptBody({
  receipt,
  onChanged,
}: {
  receipt: Receipt;
  onChanged: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [version, setVersion] = useState(0);

  const status = receipt.status;
  const open = status === "pending" || status === "partial";
  const consignment = receipt.purchaseType === "konsinyasi";
  const anyReceived = receipt.items.some(
    (item) => (toMinor(item.receivedQty) ?? 0n) > 0n,
  );

  const batchIds = receipt.items
    .map((item) => item.batchId)
    .filter((id): id is string => id !== null);

  const lots = useReceiptLots(batchIds);
  const returns = useReceiptReturns(receipt._id);

  const taxMinor = toMinor(receipt.taxAmount) ?? 0n;
  const receivedGrand = sumDecimals([
    receipt.receivedTotal,
    receipt.receivedTax,
  ]);

  const receiveHref = `/dashboard/purchasing/receipts/${receipt._id}/edit`;

  async function handleClose() {
    if (closeBusy) return;
    setCloseBusy(true);
    try {
      await goodsReceiptService.close(receipt._id);
      swalToast(
        `${receipt.receiptNumber} ditutup — sisa barang dibatalkan${
          receipt.invoiceId ? " dan tagihan faktur disesuaikan" : ""
        }.`,
      );
      setClosing(false);
      setVersion((value) => value + 1);
      onChanged();
    } catch (err) {
      swalToast(
        err instanceof ApiError ? err.fullMessage : "Gagal menutup penerimaan.",
        "error",
        6000,
      );
    } finally {
      setCloseBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* THE NUMBER IS THE TITLE, the status beside it — as an invoice's page
          reads (15 October 2026, on request). */}
      <PageHeading
        crumbs={[
          PURCHASING_CRUMBS.hub,
          PURCHASING_CRUMBS.receipts,
          { label: receipt.receiptNumber },
        ]}
        title={receipt.receiptNumber}
        aside={<ReceiptStatusBadge status={status} />}
      >
        {receipt.supplierName ?? "Supplier terhapus"} ·{" "}
        {receipt.branchName ?? "—"} · {receipt.warehouseName ?? "—"}
      </PageHeading>

      <Card>
        <div className="flex flex-wrap gap-6">
          <Field label="Supplier" value={receipt.supplierName ?? "—"} />
          {/* BRANCH BEFORE WAREHOUSE — widest scope first, the way the receipt
              form asks the same two questions. "—" for a delivery written
              before the branch was recorded. */}
          <Field label="Cabang" value={receipt.branchName ?? "—"} />
          <Field label="Gudang" value={receipt.warehouseName ?? "—"} />
          <Field label="Tanggal" value={formatDate(receipt.receiptDate)} />
          <Field
            label="Terakhir diterima"
            value={receipt.receivedAt ? formatDate(receipt.receivedAt) : "—"}
          />
          <Field label="Dicatat oleh" value={receipt.createdByName ?? "—"} />
          <div className="ml-auto flex gap-6">
            <div>
              <p className="text-xs font-medium text-muted">Jenis</p>
              <div className="mt-1">
                <SupplierTypeBadge type={receipt.purchaseType} />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {receipt.origin === "invoice" && (
        <Alert variant="info">
          Penerimaan ini dibuat dari faktur supplier — daftar barangnya mengikuti
          faktur dan tidak bisa ditambah. Yang bisa diubah hanya jumlah yang
          sudah diterima.
        </Alert>
      )}

      {/* STILL EXPECTING GOODS: what is posted so far, and the one action that
          moves it on. Partial adds the way out when the rest is not coming. */}
      {open && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-tint-warning px-4 py-3 text-sm text-foreground">
          <span>
            {status === "pending" ? (
              <>
                <b>Barang belum diterima.</b> Stok, lot, HPP
                {consignment ? "" : ", dan utang"} baru tercatat untuk barang
                yang sudah dicentang diterima.
              </>
            ) : (
              <>
                <b>Diterima sebagian.</b> Stok
                {consignment ? "" : " dan utang"} sudah tercatat untuk barang
                yang datang. Jumlahnya masih bisa dikoreksi selama penerimaan
                belum lengkap.
              </>
            )}
          </span>
          <Can feature="goodsReceipts" action="create">
            <div className="ml-auto flex flex-wrap gap-2">
              {status === "partial" && (
                <Button variant="secondary" onClick={() => setClosing(true)}>
                  Tutup penerimaan
                </Button>
              )}
              <Button asChild>
                <Link href={receiveHref}>
                  {status === "pending" ? "Terima barang" : "Update penerimaan"}
                </Link>
              </Button>
            </div>
          </Can>
        </div>
      )}

      {status === "closed" && (
        <Alert variant="info">
          Penerimaan ditutup
          {receipt.closedAt ? ` pada ${formatDate(receipt.closedAt)}` : ""}
          {receipt.closedByName ? ` oleh ${receipt.closedByName}` : ""} — sisa
          barang yang tidak datang sudah dibatalkan
          {receipt.invoiceId ? " dan tagihan fakturnya ikut disesuaikan" : ""}.
        </Alert>
      )}

      {closing && (
        <ConfirmDialog
          title={`Tutup penerimaan ${receipt.receiptNumber}?`}
          confirmLabel="Tutup penerimaan"
          destructive
          busy={closeBusy}
          onConfirm={handleClose}
          onCancel={() => setClosing(false)}
        >
          Barang yang belum datang akan dibatalkan dan penerimaan dikunci.
          {receipt.invoiceId
            ? " Tagihan faktur ikut turun menjadi senilai barang yang sudah diterima."
            : ""}{" "}
          Tindakan ini tidak bisa dibatalkan.
        </ConfirmDialog>
      )}

      {returns.length > 0 && (
        <Alert variant="info">
          Penerimaan ini sudah punya {returns.length} retur:{" "}
          {returns.map((row, index) => (
            <span key={row._id}>
              {index > 0 && ", "}
              <Link
                href={`/dashboard/purchasing/returns/${row._id}`}
                className="tabular-nums font-semibold text-primary-hover hover:underline"
              >
                {row.returnNumber}
              </Link>
              {row.status === "draft" && " (draft)"}
            </span>
          ))}
          . Periksa dulu sebelum membuat retur baru agar barang yang sama tidak
          dikembalikan dua kali.
        </Alert>
      )}

      <Card title="Barang">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produk</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Kedaluwarsa</TableHead>
                <TableHead className="text-right">Dipesan</TableHead>
                <TableHead className="text-right">Diterima</TableHead>
                <TableHead className="text-right">Sisa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Diretur</TableHead>
                <TableHead className="text-right">
                  {consignment ? "Harga setor" : "Harga beli"}
                </TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipt.items.map((item) => {
                const lot = item.batchId ? lots[item.batchId] : undefined;
                // `name` is the snapshot taken when the line was filed; shown
                // when the product has been renamed since.
                const renamed =
                  item.productName !== null && item.productName !== item.name;
                const returnedMinor = toMinor(item.returnedQty) ?? 0n;
                const cancelledMinor = toMinor(item.cancelledQty) ?? 0n;
                const expiry = lot?.expiryDate ?? item.expiryDate ?? null;

                return (
                  <TableRow key={item.itemId}>
                    <TableCell>
                      <p className="text-sm font-medium">
                        {item.productName ?? item.name}
                      </p>
                      <p className="text-xs text-muted tabular-nums">
                        <SkuText value={item.productSku} fallback="—" />
                        {renamed && (
                          <span className="ml-1 italic">
                            · saat dicatat: {item.name}
                          </span>
                        )}
                      </p>
                    </TableCell>

                    <TableCell className="text-xs tabular-nums">
                      {item.batchId ? (
                        <>
                          {lot?.batchCode ?? "ada lot"}
                          {(lot?.supplierBatchCode ?? item.supplierBatchCode) && (
                            <span className="block text-muted">
                              supplier:{" "}
                              {lot?.supplierBatchCode ?? item.supplierBatchCode}
                            </span>
                          )}
                        </>
                      ) : item.supplierBatchCode ? (
                        <span className="text-muted">
                          supplier: {item.supplierBatchCode}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {expiry ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs tabular-nums">
                            {formatDate(expiry)}
                          </span>
                          {lot?.expiryDate && (
                            <ExpiryBadge date={lot.expiryDate} />
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right text-xs tabular-nums">
                      {formatQty(item.qty)}
                      {item.productUnit && (
                        <span className="ml-1 text-muted">
                          {item.productUnit}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-right text-xs font-semibold tabular-nums">
                      {formatQty(item.receivedQty)}
                    </TableCell>

                    <TableCell className="text-right text-xs tabular-nums">
                      {cancelledMinor > 0n ? (
                        <span className="text-danger">
                          batal {formatQty(item.cancelledQty)}
                        </span>
                      ) : (
                        formatQty(item.outstandingQty)
                      )}
                    </TableCell>

                    <TableCell>
                      <ReceiptLineStatusBadge status={item.receiveStatus} />
                    </TableCell>

                    <TableCell className="text-right text-xs tabular-nums">
                      {returnedMinor > 0n ? (
                        <>
                          <span className="text-danger">
                            {formatQty(item.returnedQty)}
                          </span>
                          <span className="block text-xs text-muted">
                            sisa {formatQty(item.remainingQty)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right text-xs tabular-nums">
                      {formatMoney(item.costPerUnit)}
                    </TableCell>

                    <TableCell className="text-right text-xs tabular-nums">
                      {formatMoney(item.subtotal)}
                    </TableCell>
                  </TableRow>
                );
              })}

              <TotalRow label="Subtotal (dipesan)" value={receipt.total} strong />
              {taxMinor > 0n && (
                <TotalRow label="PPN masukan" value={receipt.taxAmount} />
              )}
              <TotalRow label="Total" value={receipt.grandTotal} strong />
              <TotalRow
                label={
                  consignment
                    ? "Nilai barang yang sudah diterima"
                    : "Sudah diterima & tercatat sebagai utang (termasuk PPN)"
                }
                value={receivedGrand}
              />
            </TableBody>
          </Table>
        </div>
      </Card>

      {receipt.notes && (
        <Card title="Catatan">
          <p className="text-sm whitespace-pre-wrap">{receipt.notes}</p>
        </Card>
      )}

      {/* ------------------------------------------------- faktur & utang */}
      {consignment ? (
        <div className="rounded-xl bg-tint-warning px-4 py-3 text-sm text-foreground">
          <b>Konsinyasi — tidak ada jurnal saat barang diterima.</b> Barang yang
          sudah diterima masuk gudang dan bisa dijual, tapi masih milik supplier
          sampai laku. Utangnya baru muncul saat barang terjual, sebesar harga
          setor per unit, dan dilunasi lewat &quot;Setor&quot; di Ringkasan
          Pembelian.
        </div>
      ) : receipt.invoiceId ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-tint-success px-4 py-3 text-sm">
          <span>
            Faktur supplier untuk penerimaan ini sudah dicatat. Utang tercatat
            sebesar barang yang sudah diterima.
          </span>
          <Button variant="ghost" size="sm" asChild className="ml-auto">
            <Link href={`/dashboard/purchasing/payables/${receipt.invoiceId}`}>
              Lihat faktur →
            </Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-tint-neutral px-4 py-3 text-sm">
          <span>
            <b>Faktur supplier belum dicatat.</b> Utang tetap tercatat sebesar
            barang yang sudah diterima; faktur menambahkan nomor tagihan dan
            jatuh temponya. Barangnya akan disalin dari penerimaan ini.
          </span>
          <Can feature="purchaseInvoices" action="create">
            <Button variant="secondary" size="sm" asChild className="ml-auto">
              <Link
                href={`/dashboard/purchasing/payables/new?receipt=${receipt._id}`}
              >
                Catat faktur supplier
              </Link>
            </Button>
          </Can>
        </div>
      )}

      <PurchaseActivityCard kind="receipt" id={receipt._id} version={version} />

      <div className="flex flex-wrap items-center gap-2">
        {/* Consignment has nothing to return AGAINST, and nothing can go back
            before something arrived. */}
        {!consignment && anyReceived && (
          <Can feature="purchaseReturns" action="create">
            <Button variant="secondary" asChild>
              <Link
                href={`/dashboard/purchasing/returns/new?receipt=${receipt._id}`}
              >
                Buat retur dari penerimaan ini
              </Link>
            </Button>
          </Can>
        )}
      </div>

      {!open && (
        <p className="text-sm text-muted">
          Penerimaan ini sudah {status === "closed" ? "ditutup" : "lengkap"} dan{" "}
          <b>tidak bisa diubah lagi</b>. Koreksi barang yang sudah diterima
          dilakukan lewat retur, yang membalik di harga beli asli.
        </p>
      )}
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={9}
        className={cn(
          "text-right text-xs",
          strong ? "font-semibold" : "text-muted",
        )}
      >
        {label}
      </TableCell>
      <TableCell
        className={cn(
          "text-right tabular-nums",
          strong ? "text-sm font-semibold" : "text-xs",
        )}
      >
        {formatMoney(value)}
      </TableCell>
    </TableRow>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn("mt-1 text-sm font-semibold", mono && "tabular-nums")}>
        {value}
      </p>
    </div>
  );
}
