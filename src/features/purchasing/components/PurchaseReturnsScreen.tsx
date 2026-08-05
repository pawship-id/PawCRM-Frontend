"use client";

import { formatMoney } from "@/utils/decimal";

import { useInventoryDemo } from "@/features/inventory/hooks/useInventoryDemo";

/**
 * Every return sent back to a supplier.
 *
 * Deliberately read-only: a return already reversed the weighted average and
 * reduced the payable when it was submitted. Editing one would have to unwind
 * both, and "unwind a reversal" is the kind of operation that quietly leaves the
 * books and the shelves disagreeing. A wrong return is corrected by receiving
 * the goods back in.
 */
export function PurchaseReturnsScreen() {
  const { purchaseReturns, purchaseReturnItems, suppliers, receipts } =
    useInventoryDemo();

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
            <th className="px-4 py-2.5 text-left font-medium">Nomor</th>
            <th className="px-4 py-2.5 text-left font-medium">Tanggal</th>
            <th className="px-4 py-2.5 text-left font-medium">Supplier</th>
            <th className="px-4 py-2.5 text-left font-medium">
              Penerimaan asal
            </th>
            <th className="px-4 py-2.5 text-right font-medium">Item</th>
            <th className="px-4 py-2.5 text-right font-medium">Nilai retur</th>
          </tr>
        </thead>
        <tbody>
          {purchaseReturns.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-16 text-center">
                <p className="font-medium text-foreground">
                  Belum ada retur pembelian
                </p>
                <p className="mt-1 text-sm text-muted">
                  Retur selalu dibuat dari penerimaan yang sudah tercatat,
                  supaya harga beli aslinya ikut terbawa.
                </p>
              </td>
            </tr>
          )}

          {purchaseReturns.map((entry) => {
            const items = purchaseReturnItems.filter(
              (item) => item.returnId === entry._id,
            );
            const source = receipts.find(
              (r) => r._id === entry.originalReceiptId,
            );

            return (
              <tr
                key={entry._id}
                className="border-b border-border/60 last:border-0"
              >
                <td className="px-4 py-2.5 font-mono text-xs">
                  {entry.returnNumber}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {new Date(entry.returnDate).toLocaleDateString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td className="px-4 py-2.5 text-sm font-medium">
                  {suppliers.find((s) => s._id === entry.supplierId)?.name ??
                    "—"}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted">
                  {source?.receiptNumber ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                  {items.length}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-danger">
                  {formatMoney(entry.totalAmount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
