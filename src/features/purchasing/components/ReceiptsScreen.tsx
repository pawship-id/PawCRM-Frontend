"use client";

import Link from "next/link";

import { Breadcrumb } from "@/components";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney, sumDecimals } from "@/utils/decimal";

import { useInventoryDemo } from "@/features/inventory/hooks/useInventoryDemo";

import { PURCHASING_CRUMBS } from "../crumbs";
import { SupplierTypeBadge } from "./SupplierTypeBadge";

/**
 * Every goods receipt, newest first.
 *
 * The faktur column is where the two receipt types visibly diverge: an outright
 * purchase carries an invoice number, a consignment carries a dash. That single
 * column is the fastest way to answer "why does this delivery not appear in my
 * payables" without opening anything.
 */
export function ReceiptsScreen() {
  const { receipts, suppliers, warehouses, invoices, receiptItems } =
    useInventoryDemo();

  const totalReceived = sumDecimals(
    receipts.map((receipt) => receipt.totalAmount),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Breadcrumb
            items={[PURCHASING_CRUMBS.hub, { label: "Penerimaan Barang" }]}
          />
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Penerimaan Barang
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Setiap penerimaan menaikkan stok dan menghitung ulang HPP rata-rata.
            Beli putus otomatis membuat faktur utang; konsinyasi tidak.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted">
              Total nilai diterima
            </p>
            <p className="font-mono text-lg font-semibold tabular-nums">
              {formatMoney(totalReceived)}
            </p>
          </div>
          <Button asChild>
            <Link href="/dashboard/purchasing/receipts/new">
              + Terima barang
            </Link>
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
              <th className="px-4 py-2.5 text-left font-medium">Nomor</th>
              <th className="px-4 py-2.5 text-left font-medium">Tanggal</th>
              <th className="px-4 py-2.5 text-left font-medium">Supplier</th>
              <th className="px-4 py-2.5 text-left font-medium">Gudang</th>
              <th className="px-4 py-2.5 text-left font-medium">Tipe</th>
              <th className="px-4 py-2.5 text-right font-medium">Item</th>
              <th className="px-4 py-2.5 text-right font-medium">Nilai</th>
              <th className="px-4 py-2.5 text-left font-medium">Faktur</th>
              <th className="px-4 py-2.5 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {receipts.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center">
                  <p className="font-medium text-foreground">
                    Belum ada penerimaan
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Catat barang masuk pertama — itulah yang membentuk HPP.
                  </p>
                </td>
              </tr>
            )}

            {receipts.map((receipt) => {
              const supplier = suppliers.find(
                (s) => s._id === receipt.supplierId,
              );
              const invoice = invoices.find((i) => i._id === receipt.invoiceId);
              const items = receiptItems.filter(
                (item) => item.receiptId === receipt._id,
              );

              return (
                <tr
                  key={receipt._id}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {receipt.receiptNumber}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {new Date(receipt.receiptDate).toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-2.5 text-sm font-medium">
                    {supplier?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">
                    {warehouses.find((w) => w._id === receipt.warehouseId)
                      ?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <SupplierTypeBadge type={receipt.receiptType} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                    {items.length}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums">
                    {formatMoney(
                      sumDecimals([receipt.totalAmount, receipt.taxAmount]),
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {invoice ? (
                      <Link
                        href={`/dashboard/purchasing/payables/${invoice._id}`}
                        className="font-mono text-xs text-primary-hover hover:underline"
                      >
                        {invoice.invoiceNumber}
                      </Link>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-secondary/25 text-secondary-foreground"
                      >
                        tanpa faktur
                      </Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        href={`/dashboard/purchasing/receipts/${receipt._id}`}
                      >
                        Detail
                      </Link>
                    </Button>
                    {receipt.receiptType === "beli_putus" && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          href={`/dashboard/purchasing/returns/new?receipt=${receipt._id}`}
                        >
                          Retur
                        </Link>
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        Penerimaan tidak bisa diedit atau dihapus. Koreksi dilakukan lewat{" "}
        <Link
          href="/dashboard/purchasing/returns"
          className="text-primary-hover hover:underline"
        >
          retur ke supplier
        </Link>{" "}
        — yang sekaligus membalik HPP di harga beli aslinya dan mengurangi
        utang.
      </p>
    </div>
  );
}
