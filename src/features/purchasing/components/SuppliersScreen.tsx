"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { formatMoney, sumDecimals, toMinor } from "@/utils/decimal";
import type { Supplier } from "@/types/purchasing";

import * as demo from "@/features/inventory/data/demoStore";
import { useInventoryDemo } from "@/features/inventory/hooks/useInventoryDemo";

import { SupplierTypeBadge } from "./SupplierTypeBadge";

/**
 * The supplier list — who supplies the tenant, on what terms, and what is still
 * owed to each.
 *
 * THE OUTSTANDING COLUMN IS THE POINT. A supplier list without it is an address
 * book; with it, it is the screen somebody opens before deciding who to pay
 * this week. It is summed from unpaid invoices rather than stored, so it cannot
 * drift away from what the payables screen says.
 */
export function SuppliersScreen() {
  const { suppliers, receipts, invoices, sync } = useInventoryDemo();
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return suppliers;

    return suppliers.filter((supplier) =>
      [supplier.name, supplier.phone, supplier.npwp, supplier.picName]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(query)),
    );
  }, [suppliers, search]);

  // Summed through the decimal helper rather than raw BigInt division, which
  // truncates — the one place a rounding slip would be most visible.
  const totalOwed = sumDecimals(
    invoices
      .filter((invoice) => invoice.status !== "paid")
      .map((invoice) => demo.outstandingOf(invoice)),
  );

  /**
   * Deleting is guarded, and the refusal carries the reason.
   *
   * A supplier that has ever delivered is deactivated rather than removed: the
   * receipts that formed the current HPP point at it, and removing it would
   * leave every one of those unable to say where the goods came from.
   */
  function handleDelete(supplier: Supplier) {
    const result = demo.deleteSupplier(supplier._id);
    if (!result.ok) {
      swalToast(result.reason ?? "Tidak bisa dihapus.");
      return;
    }
    sync();
    swalToast(`${supplier.name} dihapus.`);
  }

  function handleToggle(supplier: Supplier) {
    demo.toggleSupplierActive(supplier._id);
    sync();
    swalToast(
      supplier.isActive
        ? `${supplier.name} dinonaktifkan.`
        : `${supplier.name} diaktifkan lagi.`,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Supplier</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Data pemasok, termin pembayaran, dan sisa utang yang belum dibayar.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted">
              Total sisa utang
            </p>
            <p
              className={cn(
                "font-mono text-lg font-semibold tabular-nums",
                (toMinor(totalOwed) ?? 0n) > 0n && "text-danger",
              )}
            >
              {formatMoney(totalOwed)}
            </p>
          </div>
          <Button asChild>
            <Link href="/dashboard/purchasing/suppliers/new">
              + Supplier baru
            </Link>
          </Button>
        </div>
      </div>

      <Input
        placeholder="Cari nama, telepon, PIC, atau NPWP…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="max-w-sm"
        aria-label="Cari supplier"
      />

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
              <th className="px-4 py-2.5 text-left font-medium">Supplier</th>
              <th className="px-4 py-2.5 text-left font-medium">Kontak</th>
              <th className="px-4 py-2.5 text-left font-medium">Tipe</th>
              <th className="px-4 py-2.5 text-right font-medium">Termin</th>
              <th className="px-4 py-2.5 text-right font-medium">Penerimaan</th>
              <th className="px-4 py-2.5 text-right font-medium">Sisa utang</th>
              <th className="px-4 py-2.5 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center">
                  <p className="font-medium text-foreground">
                    Supplier tidak ditemukan
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Ubah kata pencarian.
                  </p>
                </td>
              </tr>
            )}

            {rows.map((supplier) => {
              const supplierReceipts = receipts.filter(
                (receipt) => receipt.supplierId === supplier._id,
              );
              const owed = demo.supplierOutstanding(supplier._id);
              const owedMinor = toMinor(owed) ?? 0n;

              return (
                <tr
                  key={supplier._id}
                  className={cn(
                    "border-b border-border/60 last:border-0",
                    !supplier.isActive && "opacity-55",
                  )}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/purchasing/suppliers/${supplier._id}`}
                        className="font-medium hover:text-primary-hover hover:underline"
                      >
                        {supplier.name}
                      </Link>
                      {!supplier.isActive && (
                        <Badge variant="outline">nonaktif</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {supplier.address ?? "—"}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <p>{supplier.picName ?? "—"}</p>
                    <p className="text-muted">{supplier.phone ?? ""}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <SupplierTypeBadge type={supplier.supplierType} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                    {supplier.paymentTermDays} hari
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                    {supplierReceipts.length}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right font-mono text-sm tabular-nums",
                      owedMinor > 0n && "font-semibold text-danger",
                    )}
                  >
                    {owedMinor > 0n ? formatMoney(owed) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        href={`/dashboard/purchasing/suppliers/${supplier._id}`}
                      >
                        Detail
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(supplier)}
                    >
                      {supplier.isActive ? "Nonaktifkan" : "Aktifkan"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      onClick={() => handleDelete(supplier)}
                    >
                      Hapus
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
