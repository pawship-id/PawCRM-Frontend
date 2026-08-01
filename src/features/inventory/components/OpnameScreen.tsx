"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatMoney, toMinor } from "@/utils/decimal";

import * as demo from "../data/demoStore";
import { useInventoryDemo } from "../hooks/useInventoryDemo";

/**
 * The stock-count list: sheets in progress, and sheets already final.
 *
 * WHY A SHEET RATHER THAN A ROW-BY-ROW EDIT. Counting a warehouse takes an
 * afternoon and sales keep happening while it runs. Adjusting each product as
 * you go would fold every sale made during the count into the variance, and the
 * number at the end would measure the count itself rather than what is missing.
 * Opening a sheet SNAPSHOTS the system quantity and the cost of every product,
 * so the difference means what it claims to.
 *
 * A sheet is a draft until it is submitted. Nothing moves until then — which is
 * what makes it safe to start one in the morning and finish it after lunch.
 */
export function OpnameScreen() {
  const router = useRouter();
  const { opnames, warehouses, opnameItems, sync } = useInventoryDemo();

  const [warehouseId, setWarehouseId] = useState(warehouses[0]._id);
  const [starting, setStarting] = useState(false);

  function handleStart() {
    setStarting(true);
    const opname = demo.startOpname(warehouseId);
    sync();
    router.push(`/dashboard/inventory/opname/${opname._id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="min-w-56 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
            Mulai hitung fisik
          </p>
          <p className="mt-1 text-sm text-muted">
            Sistem akan mengunci angka stok dan HPP setiap produk di gudang ini
            saat lembar dibuka, supaya penjualan yang terjadi selama penghitungan
            tidak ikut terhitung sebagai selisih.
          </p>
        </div>
        <Select value={warehouseId} onValueChange={setWarehouseId}>
          <SelectTrigger className="w-56" aria-label="Gudang yang dihitung">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {warehouses
              .filter((warehouse) => warehouse.isActive)
              .map((warehouse) => (
                <SelectItem key={warehouse._id} value={warehouse._id}>
                  {warehouse.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button onClick={handleStart} disabled={starting}>
          {starting ? "Menyiapkan…" : "+ Mulai opname"}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
              <th className="px-4 py-2.5 text-left font-medium">Nomor</th>
              <th className="px-4 py-2.5 text-left font-medium">Tanggal</th>
              <th className="px-4 py-2.5 text-left font-medium">Gudang</th>
              <th className="px-4 py-2.5 text-right font-medium">Item</th>
              <th className="px-4 py-2.5 text-right font-medium">Selisih nilai</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {opnames.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center">
                  <p className="font-medium text-foreground">Belum ada opname</p>
                  <p className="mt-1 text-sm text-muted">
                    Mulai penghitungan pertama untuk mencocokkan stok fisik
                    dengan catatan sistem.
                  </p>
                </td>
              </tr>
            )}

            {opnames.map((opname) => {
              const items = opnameItems.filter((item) => item.opnameId === opname._id);
              const counted = items.filter((item) => item.physicalQty !== null).length;
              const total =
                opname.status === "submitted"
                  ? opname.totalDiffValue
                  : demo.opnameTotal(opname._id);
              const totalMinor = toMinor(total) ?? 0n;

              return (
                <tr key={opname._id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{opname.opnameNumber}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {new Date(opname.opnameDate).toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">
                    {warehouses.find((w) => w._id === opname.warehouseId)?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                    {counted} / {items.length}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right font-mono text-sm font-semibold tabular-nums",
                      totalMinor < 0n && "text-danger",
                      totalMinor > 0n && "text-success",
                    )}
                  >
                    {totalMinor === 0n ? "—" : formatMoney(total)}
                  </td>
                  <td className="px-4 py-2.5">
                    {opname.status === "submitted" ? (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-success/12 text-success"
                      >
                        final
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-secondary/25 text-secondary-foreground"
                      >
                        draft
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/dashboard/inventory/opname/${opname._id}`}
                      className="text-sm font-medium text-primary-hover hover:underline"
                    >
                      {opname.status === "draft" ? "Lanjutkan" : "Lihat"}
                    </Link>
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
