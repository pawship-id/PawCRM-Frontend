"use client";

import Link from "next/link";

import { Alert, Card } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatMoney,
  formatQty,
  multiplyDecimals,
  sumDecimals,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";

import * as demo from "@/features/inventory/data/demoStore";
import { useInventoryDemo } from "@/features/inventory/hooks/useInventoryDemo";

import { SupplierTypeBadge } from "./SupplierTypeBadge";

/**
 * One supplier: terms, purchase history, and what is still owed.
 *
 * THE CONSIGNMENT PANEL is the part that does not exist for other suppliers and
 * matters most where it does. Consigned goods sit in the warehouse looking
 * exactly like owned stock, but every unit that sells creates a debt that no
 * invoice has recorded — because the invoice only exists once the goods are
 * bought. Until that settlement flow is built, this panel IS the record of what
 * is owed, so it shows both what has sold and what is still on the shelf.
 */
export function SupplierDetail({ supplierId }: { supplierId: string }) {
  const { suppliers, receipts, receiptItems, batches, products } =
    useInventoryDemo();

  const supplier = suppliers.find((s) => s._id === supplierId);

  if (!supplier) {
    return (
      <Alert variant="error">
        Supplier tidak ditemukan. Mungkin data prototype sudah di-reset.
      </Alert>
    );
  }

  const supplierReceipts = receipts.filter((r) => r.supplierId === supplierId);
  const purchased = sumDecimals(supplierReceipts.map((r) => r.totalAmount));
  const owed = demo.supplierOutstanding(supplierId);

  // Consigned lots still holding stock, traced back through their receipt.
  const consigned = batches.filter((batch) => {
    if (!batch.isConsignment) return false;
    if ((toMinor(batch.qtyRemaining) ?? 0n) <= 0n) return false;
    return supplierReceipts.some((receipt) =>
      receiptItems.some(
        (item) => item.receiptId === receipt._id && item.batchId === batch._id,
      ),
    );
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-4 rounded-xl border border-border bg-surface p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{supplier.name}</h2>
            <SupplierTypeBadge type={supplier.supplierType} />
            {!supplier.isActive && <Badge variant="outline">nonaktif</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted">{supplier.address ?? "—"}</p>
        </div>
        <Button variant="outline" asChild className="ml-auto">
          <Link href={`/dashboard/purchasing/suppliers/${supplier._id}/edit`}>
            Edit supplier
          </Link>
        </Button>
        <Button asChild>
          <Link
            href={`/dashboard/purchasing/receipts/new?supplier=${supplier._id}`}
          >
            Terima barang
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total pembelian" value={formatMoney(purchased)} />
        <Stat
          label="Sisa utang"
          value={formatMoney(owed)}
          tone={(toMinor(owed) ?? 0n) > 0n ? "danger" : "default"}
        />
        <Stat label="Penerimaan" value={String(supplierReceipts.length)} />
        <Stat label="Termin" value={`${supplier.paymentTermDays} hari`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Card title="Kontak & administrasi">
          <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">PIC</dt>
            <dd className="font-medium">{supplier.picName ?? "—"}</dd>
            <dt className="text-muted">Telepon</dt>
            <dd className="font-medium">{supplier.phone ?? "—"}</dd>
            <dt className="text-muted">Email</dt>
            <dd className="truncate font-medium">{supplier.email ?? "—"}</dd>
            <dt className="text-muted">NPWP</dt>
            <dd className="font-mono text-xs">{supplier.npwp ?? "—"}</dd>
            <dt className="text-muted">Catatan</dt>
            <dd className="text-xs">{supplier.notes ?? "—"}</dd>
          </dl>
        </Card>

        <Card title="Riwayat penerimaan">
          {supplierReceipts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              Belum ada penerimaan dari supplier ini.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
                    <th className="px-2 py-2 text-left font-medium">Nomor</th>
                    <th className="px-2 py-2 text-left font-medium">Tanggal</th>
                    <th className="px-2 py-2 text-left font-medium">Tipe</th>
                    <th className="px-2 py-2 text-right font-medium">Nilai</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierReceipts.map((receipt) => (
                    <tr
                      key={receipt._id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-2 py-2">
                        <Link
                          href={`/dashboard/purchasing/receipts/${receipt._id}`}
                          className="font-mono text-xs text-primary-hover hover:underline"
                        >
                          {receipt.receiptNumber}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {new Date(receipt.receiptDate).toLocaleDateString(
                          "id-ID",
                          {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          },
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <SupplierTypeBadge type={receipt.receiptType} />
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                        {formatMoney(receipt.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {consigned.length > 0 && (
        <Card title="Barang konsinyasi masih di toko">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
                  <th className="px-2 py-2 text-left font-medium">Produk</th>
                  <th className="px-2 py-2 text-left font-medium">Batch</th>
                  <th className="px-2 py-2 text-right font-medium">Diterima</th>
                  <th className="px-2 py-2 text-right font-medium">Terjual</th>
                  <th className="px-2 py-2 text-right font-medium">Sisa</th>
                  <th className="px-2 py-2 text-right font-medium">
                    Utang jika laku
                  </th>
                </tr>
              </thead>
              <tbody>
                {consigned.map((batch) => {
                  // Clamped at zero: a lot driven negative by a short pick has
                  // sold everything it ever held, not more than it held.
                  const soldMinor =
                    (toMinor(batch.initialQty) ?? 0n) -
                    (toMinor(batch.qtyRemaining) ?? 0n);
                  const sold = toDecimalString(soldMinor > 0n ? soldMinor : 0n);
                  return (
                    <tr
                      key={batch._id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-2 py-2 text-xs">
                        {products.find((p) => p._id === batch.productId)
                          ?.name ?? "—"}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">
                        {batch.batchCode}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-xs tabular-nums text-muted">
                        {formatQty(batch.initialQty)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                        {formatQty(sold)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-xs font-semibold tabular-nums">
                        {formatQty(batch.qtyRemaining)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                        {formatMoney(multiplyDecimals(sold, batch.costPerUnit))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-muted">
            Kolom terakhir dihitung dari yang <b>sudah laku</b> — itulah yang
            sebenarnya terutang, meski belum ada faktur untuknya. Pelunasan
            otomatis saat barang terjual menyusul; untuk sekarang dicatat manual
            sebagai pembelian biasa.
          </p>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-surface p-4",
        tone === "danger" ? "border-danger/40 bg-danger/5" : "border-border",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 font-mono text-lg font-semibold tabular-nums",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </p>
    </div>
  );
}
