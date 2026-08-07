"use client";

import Link from "next/link";

import { Alert, Card, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty, toMinor } from "@/utils/decimal";
import { Can } from "@/features/permissions";
import { ExpiryBadge } from "@/features/inventory/components/ExpiryBadge";
import type { GoodsReceiptDetail as Receipt } from "@/types/api";

import { useGoodsReceipt } from "../hooks/useGoodsReceipt";
import { useReceiptLots } from "../hooks/useReceiptLots";
import { useReceiptReturns } from "../hooks/useReceiptReturns";
import { SupplierTypeBadge } from "./SupplierTypeBadge";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * One goods receipt: what arrived, at what price, and what it set in motion.
 *
 * A RECEIPT IS READ-ONLY ONCE SAVED, and this screen is shaped by that. It has
 * already raised stock, created lots and moved the weighted average — editing it
 * would have to unwind all three, and "unwind an average" is not an operation
 * with one right answer once a sale has been priced against it. There is no edit
 * button here because there is no endpoint behind one. Correction is a return,
 * which reverses at the original price and says so in the ledger.
 *
 * NO JOURNAL PANEL, unlike the form that created this. The document stores
 * `journalEntryId` but the receipt payload carries no lines, and reconstructing
 * an entry from `total` and `taxAmount` would be this screen ASSERTING what was
 * posted rather than reading it — which is exactly the class of confident wrong
 * number the preview endpoint exists to stop. The entry is linked instead.
 */
export function ReceiptDetail({ receiptId }: { receiptId: string }) {
  const { receipt, loading, error, notFound, refetch } =
    useGoodsReceipt(receiptId);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat detail penerimaan…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
        <p className="text-sm font-medium text-foreground">
          Penerimaan tidak ditemukan.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Nomor ini tidak ada, atau bukan milik tenant Anda.
        </p>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/dashboard/purchasing/receipts">
            ← Semua penerimaan
          </Link>
        </Button>
      </div>
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

  return <ReceiptBody receipt={receipt} />;
}

/**
 * Split from the guard clauses above so the hooks that decorate a LOADED receipt
 * — its lots, its returns — are not called conditionally.
 */
function ReceiptBody({ receipt }: { receipt: Receipt }) {
  const consignment = receipt.purchaseType === "konsinyasi";

  const batchIds = receipt.items
    .map((item) => item.batchId)
    .filter((id): id is string => id !== null);

  const lots = useReceiptLots(batchIds);
  const returns = useReceiptReturns(receipt._id);

  const taxMinor = toMinor(receipt.taxAmount) ?? 0n;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-6 rounded-xl border border-border bg-surface p-4">
        <Field label="Nomor" value={receipt.receiptNumber} mono />
        <Field label="Supplier" value={receipt.supplierName ?? "—"} />
        <Field label="Gudang" value={receipt.warehouseName ?? "—"} />
        <Field label="Tanggal terima" value={formatDate(receipt.receiptDate)} />
        <Field label="Dicatat oleh" value={receipt.createdByName ?? "—"} />
        <div className="ml-auto">
          <p className="text-[10px] font-medium tracking-widest text-muted uppercase">
            Jenis
          </p>
          <div className="mt-1">
            <SupplierTypeBadge type={receipt.purchaseType} />
          </div>
        </div>
      </div>

      {returns.length > 0 && (
        <Alert variant="info">
          Penerimaan ini sudah punya {returns.length} retur:{" "}
          {returns.map((row, index) => (
            <span key={row._id}>
              {index > 0 && ", "}
              <b className="font-mono">{row.returnNumber}</b>
              {row.status === "draft" && " (draft)"}
            </span>
          ))}
          . Periksa dulu sebelum membuat retur baru agar barang yang sama tidak
          dikembalikan dua kali.
        </Alert>
      )}

      <Card title="Barang yang diterima">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] tracking-widest text-muted uppercase">
                <th className="px-2 py-2 text-left font-medium">Produk</th>
                <th className="px-2 py-2 text-left font-medium">Lot</th>
                <th className="px-2 py-2 text-right font-medium">Qty</th>
                <th className="px-2 py-2 text-right font-medium">Harga beli</th>
                <th className="px-2 py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item) => {
                const lot = item.batchId ? lots[item.batchId] : undefined;
                // `name` is the snapshot taken the day the goods arrived. It is
                // shown when the product has been renamed since, because a
                // document that silently adopts today's name stops matching the
                // paperwork it was reconciled against.
                const renamed =
                  item.productName !== null && item.productName !== item.name;

                return (
                  <tr
                    key={item.itemId}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-2 py-2">
                      <p className="text-sm font-medium">
                        {item.productName ?? item.name}
                      </p>
                      <p className="font-mono text-xs text-muted">
                        {item.productSku ?? "—"}
                        {renamed && (
                          <span className="ml-1 font-sans italic">
                            · saat diterima: {item.name}
                          </span>
                        )}
                      </p>
                    </td>

                    <td className="px-2 py-2">
                      {item.batchId ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs">
                            {/* The lot lookup is best-effort — see
                                useReceiptLots. Without it the line still says a
                                lot exists, which is the fact that matters. */}
                            {lot?.batchCode ?? "ada lot"}
                          </span>
                          {lot?.expiryDate && (
                            <ExpiryBadge date={lot.expiryDate} />
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>

                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                      {formatQty(item.qty)}
                      {item.productUnit && (
                        <span className="ml-1 text-muted">
                          {item.productUnit}
                        </span>
                      )}
                    </td>

                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                      {formatMoney(item.costPerUnit)}
                    </td>

                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                      {formatMoney(item.subtotal)}
                    </td>
                  </tr>
                );
              })}

              <tr className="bg-accent/40">
                <td
                  colSpan={4}
                  className="px-2 py-2 text-right text-xs font-semibold"
                >
                  Subtotal
                </td>
                <td className="px-2 py-2 text-right font-mono text-sm font-semibold tabular-nums">
                  {formatMoney(receipt.total)}
                </td>
              </tr>

              {taxMinor > 0n && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-2 py-2 text-right text-xs text-muted"
                  >
                    PPN masukan
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                    {formatMoney(receipt.taxAmount)}
                  </td>
                </tr>
              )}

              <tr>
                <td
                  colSpan={4}
                  className="px-2 py-2 text-right text-xs font-semibold"
                >
                  Total
                </td>
                <td className="px-2 py-2 text-right font-mono text-sm font-semibold tabular-nums">
                  {formatMoney(receipt.grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {receipt.notes && (
        <Card title="Catatan">
          <p className="text-sm whitespace-pre-wrap">{receipt.notes}</p>
        </Card>
      )}

      {/* ------------------------------------------------- utang & dokumentasi */}
      {consignment ? (
        <div className="rounded-lg border border-secondary/40 bg-secondary/10 px-4 py-3 text-sm text-secondary-foreground">
          <b>Konsinyasi — belum ada utang.</b> Barang sudah masuk gudang dan bisa
          dijual, tapi masih milik supplier sampai laku. Tidak ada jurnal yang
          dibuat karena belum ada yang dibeli.
        </div>
      ) : receipt.invoiceId ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-sm">
          <span>
            Faktur supplier sudah difilekan untuk penerimaan ini.
          </span>
          <Button variant="ghost" size="sm" asChild className="ml-auto">
            <Link href={`/dashboard/purchasing/payables/${receipt.invoiceId}`}>
              Lihat faktur →
            </Link>
          </Button>
        </div>
      ) : (
        /* NOT "no debt". The receipt already credited 2101 when it posted — the
           payable exists. What is missing is the vendor's own document, which is
           filed separately and is what carries their invoice number and the due
           date derived from the supplier's payment terms. */
        <div className="rounded-lg border border-border bg-accent/40 px-4 py-3 text-sm">
          <b>Utang sudah tercatat, faktur supplier belum difilekan.</b>{" "}
          Penerimaan beli putus langsung mengkredit akun 2101 saat diposting.
          Nomor faktur dan tanggal jatuh tempo baru muncul setelah tagihan dari
          supplier dicatat di{" "}
          <Link
            href="/dashboard/purchasing/payables"
            className="text-primary-hover hover:underline"
          >
            utang usaha
          </Link>
          .
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Consignment has nothing to return AGAINST: the goods were never
            bought, so sending them back reverses no purchase and no debt. */}
        {!consignment && (
          <Can feature="purchaseReturns" action="create">
            <Button variant="outline" asChild>
              <Link
                href={`/dashboard/purchasing/returns/new?receipt=${receipt._id}`}
              >
                Buat retur dari penerimaan ini
              </Link>
            </Button>
          </Can>
        )}
        <Button variant="ghost" asChild>
          <Link href="/dashboard/purchasing/receipts">← Semua penerimaan</Link>
        </Button>
      </div>

      <p className="text-xs text-muted">
        Penerimaan ini <b>tidak bisa diedit atau dihapus</b>. Ia sudah menaikkan
        stok, membuat lot, dan menggeser HPP — mengubahnya berarti membatalkan
        ketiganya, padahal penjualan mungkin sudah dihargai memakai HPP itu.
        Koreksinya lewat retur, yang membalik di harga beli asli.
      </p>
    </div>
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
      <p className="text-[10px] font-medium tracking-widest text-muted uppercase">
        {label}
      </p>
      <p className={cn("mt-1 text-sm font-semibold", mono && "font-mono")}>
        {value}
      </p>
    </div>
  );
}
