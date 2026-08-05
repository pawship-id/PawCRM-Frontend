"use client";

import Link from "next/link";

import { Alert, Card } from "@/components";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty, sumDecimals, toMinor } from "@/utils/decimal";

import * as demo from "@/features/inventory/data/demoStore";
import { useInventoryDemo } from "@/features/inventory/hooks/useInventoryDemo";
import { JournalPreview } from "@/features/inventory/components/JournalPreview";
import { ExpiryBadge } from "@/features/inventory/components/ExpiryBadge";

import { SupplierTypeBadge } from "./SupplierTypeBadge";

/**
 * One goods receipt: what arrived, at what price, and what it set in motion.
 *
 * A receipt is READ-ONLY once saved. It has already raised stock, created lots
 * and moved the weighted average — editing it would have to unwind all three,
 * and "unwind an average" is not an operation with one right answer once a sale
 * has been priced against it. Correction is a return, which reverses at the
 * original price and says so in the ledger.
 */
export function ReceiptDetail({ receiptId }: { receiptId: string }) {
  const {
    receipts,
    receiptItems,
    suppliers,
    warehouses,
    products,
    batches,
    invoices,
  } = useInventoryDemo();

  const receipt = receipts.find((r) => r._id === receiptId);

  if (!receipt) {
    return (
      <Alert variant="error">
        Penerimaan tidak ditemukan. Mungkin data prototype sudah di-reset.
      </Alert>
    );
  }

  const supplier = suppliers.find((s) => s._id === receipt.supplierId);
  const invoice = invoices.find((i) => i._id === receipt.invoiceId);
  const items = receiptItems.filter((item) => item.receiptId === receipt._id);
  const consignment = receipt.receiptType === "konsinyasi";

  const journal = demo.previewReceiptJournal(
    receipt.totalAmount,
    receipt.taxAmount,
    consignment,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-6 rounded-xl border border-border bg-surface p-4">
        <Field label="Nomor" value={receipt.receiptNumber} mono />
        <Field label="Supplier" value={supplier?.name ?? "—"} />
        <Field
          label="Gudang"
          value={
            warehouses.find((w) => w._id === receipt.warehouseId)?.name ?? "—"
          }
        />
        <Field
          label="Tanggal"
          value={new Date(receipt.receiptDate).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        />
        <div className="ml-auto">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted">
            Tipe
          </p>
          <div className="mt-1">
            <SupplierTypeBadge type={receipt.receiptType} />
          </div>
        </div>
      </div>

      <Card title="Barang yang diterima">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
                <th className="px-2 py-2 text-left font-medium">Produk</th>
                <th className="px-2 py-2 text-left font-medium">Lot</th>
                <th className="px-2 py-2 text-right font-medium">Qty</th>
                <th className="px-2 py-2 text-right font-medium">Harga beli</th>
                <th className="px-2 py-2 text-right font-medium">Subtotal</th>
                <th className="px-2 py-2 text-right font-medium">
                  Sudah diretur
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const product = products.find((p) => p._id === item.productId);
                const batch = item.batchId
                  ? batches.find((b) => b._id === item.batchId)
                  : undefined;
                const returned = demo.returnedQtyOf(item._id);
                const hasReturn = (toMinor(returned) ?? 0n) > 0n;

                return (
                  <tr
                    key={item._id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-2 py-2">
                      <p className="text-sm font-medium">
                        {product?.name ?? "—"}
                      </p>
                      <p className="font-mono text-xs text-muted">
                        {product?.sku}
                      </p>
                    </td>
                    <td className="px-2 py-2">
                      {batch ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs">
                            {batch.batchCode}
                          </span>
                          {batch.expiryDate && (
                            <ExpiryBadge date={batch.expiryDate} />
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                      {formatQty(item.qty)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                      {formatMoney(item.costPerUnit)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                      {formatMoney(item.subtotal)}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-2 text-right font-mono text-xs tabular-nums",
                        hasReturn ? "text-danger" : "text-muted",
                      )}
                    >
                      {hasReturn ? formatQty(returned) : "—"}
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
                  {formatMoney(receipt.totalAmount)}
                </td>
                <td />
              </tr>
              {!consignment && (toMinor(receipt.taxAmount) ?? 0n) > 0n && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-2 py-2 text-right text-xs text-muted"
                  >
                    PPN
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                    {formatMoney(receipt.taxAmount)}
                  </td>
                  <td />
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
                  {formatMoney(
                    consignment
                      ? receipt.totalAmount
                      : sumDecimals([receipt.totalAmount, receipt.taxAmount]),
                  )}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {invoice ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-sm">
          <span>
            Faktur <b className="font-mono">{invoice.invoiceNumber}</b> dibuat
            otomatis · jatuh tempo{" "}
            {new Date(invoice.dueDate).toLocaleDateString("id-ID", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}{" "}
            · sisa <b>{formatMoney(demo.outstandingOf(invoice))}</b>
          </span>
          <Button variant="ghost" size="sm" asChild className="ml-auto">
            <Link href={`/dashboard/purchasing/payables/${invoice._id}`}>
              Lihat faktur →
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-secondary/40 bg-secondary/10 px-4 py-3 text-sm text-secondary-foreground">
          <b>Konsinyasi — belum ada faktur utang.</b> Barang sudah masuk gudang
          dan bisa dijual, tapi masih milik supplier sampai laku. Tidak ada
          jurnal yang dibuat karena belum ada yang dibeli.
        </div>
      )}

      <JournalPreview
        lines={journal}
        emptyReason={
          consignment
            ? "Tidak ada jurnal untuk penerimaan konsinyasi."
            : undefined
        }
      />

      <div className="flex flex-wrap gap-2">
        {receipt.receiptType === "beli_putus" && (
          <Button variant="outline" asChild>
            <Link
              href={`/dashboard/purchasing/returns/new?receipt=${receipt._id}`}
            >
              Buat retur dari penerimaan ini
            </Link>
          </Button>
        )}
        <Button variant="ghost" asChild>
          <Link href="/dashboard/purchasing/receipts">← Semua penerimaan</Link>
        </Button>
      </div>

      <p className="text-xs text-muted">
        Penerimaan ini <b>tidak bisa diedit</b>. Ia sudah menaikkan stok,
        membuat lot, dan menggeser HPP — mengubahnya berarti membatalkan
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
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted">
        {label}
      </p>
      <p className={cn("mt-1 text-sm font-semibold", mono && "font-mono")}>
        {value}
      </p>
    </div>
  );
}
