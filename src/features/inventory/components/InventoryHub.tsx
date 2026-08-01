"use client";

import Link from "next/link";

import { Button } from "@/components";
import { Badge } from "@/components/ui/badge";
import { expiresWithin } from "@/utils/date";
import { formatMoney, formatQty, multiplyDecimals, toMinor } from "@/utils/decimal";

import * as demo from "../data/demoStore";
import { useInventoryDemo } from "../hooks/useInventoryDemo";
import { ExpiryBadge } from "./ExpiryBadge";

/**
 * The Inventory landing screen: what needs attention, and the three actions.
 *
 * The two alert lists are chosen rather than exhaustive. A shop owner opening
 * this page is asking one of exactly two questions — "what do I need to reorder"
 * and "what is about to go bad" — and both are answers you act on the same day.
 * Everything else (full stock value, movement history) is a click away on the
 * stock card, where there is room to read it properly.
 */
const ACTIONS = [
  {
    href: "/dashboard/inventory/products",
    title: "Produk & Varian",
    description:
      "Katalog: produk biasa, keluarga varian dua tingkat, dan bundle multi-satuan.",
  },
  {
    href: "/dashboard/inventory/stock-card",
    title: "Kartu Stok",
    description:
      "Riwayat pergerakan satu produk di satu gudang, dengan saldo berjalan.",
  },
  {
    href: "/dashboard/inventory/batches",
    title: "Batch & Expired",
    description:
      "Semua lot, diurutkan dari yang paling dekat kedaluwarsa. Urutan FEFO.",
  },
  {
    href: "/dashboard/inventory/opname",
    title: "Stok Opname",
    description:
      "Hitung fisik, cocokkan dengan sistem, selisihnya jadi penyesuaian dan jurnal.",
  },
  {
    href: "/dashboard/inventory/transfers",
    title: "Transfer Stok",
    description:
      "Pindahkan barang antar gudang. Lot beserta tanggal kedaluwarsanya ikut pindah.",
  },
  {
    href: "/dashboard/inventory/adjustments",
    title: "Penyesuaian cepat",
    description:
      "Koreksi satu barang di luar opname — rusak, hilang, atau terpakai sendiri.",
  },
];

export function InventoryHub() {
  const { products, warehouses, batches, version, reset } = useInventoryDemo();

  // Products at or below their reorder threshold, per warehouse.
  const low = products.flatMap((product) =>
    warehouses
      .filter((warehouse) => warehouse.isActive)
      .map((warehouse) => ({
        product,
        warehouse,
        onHand: demo.qtyOnHand(product._id, warehouse._id),
      }))
      .filter(
        ({ onHand }) =>
          (toMinor(onHand) ?? 0n) > 0n &&
          (toMinor(onHand) ?? 0n) <= BigInt(product.minStock) * 10_000n,
      ),
  );

  // Lots that still hold something and expire within 30 days — including the
  // ones already past, which sort to the top because they are the urgent case.
  const expiring = batches
    .filter(
      (batch) =>
        (toMinor(batch.qtyRemaining) ?? 0n) > 0n &&
        expiresWithin(batch.expiryDate, 30),
    )
    .sort((a, b) => (a.expiryDate ?? "").localeCompare(b.expiryDate ?? ""));

  return (
    <div className="flex flex-col gap-6" key={version}>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Inventory</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Stok dihitung dari buku besar pergerakan — bukan angka yang disimpan
            terpisah. Setiap saldo di layar ini bisa dihitung ulang dari nol.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="border-secondary text-secondary-foreground">
            Prototype · data contoh
          </Badge>
          <Button variant="secondary" onClick={reset}>
            Reset data
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group rounded-xl border border-border bg-surface p-5 transition hover:border-primary hover:shadow-sm"
          >
            <p className="font-semibold text-foreground group-hover:text-primary-hover">
              {action.title}
            </p>
            <p className="mt-1.5 text-sm text-muted">{action.description}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface">
          <header className="flex items-center gap-2 border-b border-border px-5 py-3">
            <h2 className="font-semibold">Perlu restock</h2>
            <Badge variant="outline" className="ml-auto">
              {low.length}
            </Badge>
          </header>

          {low.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">
              Semua stok di atas batas minimum.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {low.map(({ product, warehouse, onHand }) => (
                <li
                  key={`${product._id}-${warehouse._id}`}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="truncate text-xs text-muted">{warehouse.name}</p>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums text-danger">
                    {formatQty(onHand)}
                  </span>
                  <span className="text-xs text-muted">/ {product.minStock}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface">
          <header className="flex items-center gap-2 border-b border-border px-5 py-3">
            <h2 className="font-semibold">Mendekati kedaluwarsa</h2>
            <Badge variant="outline" className="ml-auto">
              {expiring.length}
            </Badge>
          </header>

          {expiring.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">
              Tidak ada lot yang kedaluwarsa dalam 30 hari.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {expiring.map((batch) => {
                const product = products.find((p) => p._id === batch.productId);
                return (
                  <li key={batch._id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {product?.name ?? batch.productId}
                      </p>
                      <p className="truncate font-mono text-xs text-muted">
                        {batch.batchCode}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm tabular-nums">
                        {formatQty(batch.qtyRemaining)}
                      </p>
                      <p className="font-mono text-[11px] text-muted">
                        {formatMoney(
                          multiplyDecimals(batch.qtyRemaining, batch.costPerUnit),
                        )}
                      </p>
                    </div>
                    {batch.expiryDate && <ExpiryBadge date={batch.expiryDate} />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
