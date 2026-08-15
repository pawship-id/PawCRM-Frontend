"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { Alert, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/features/permissions";
import type { Action, Feature } from "@/features/permissions";
import { formatMoney, formatQty, multiplyDecimals } from "@/utils/decimal";

import { useExpiringAlert } from "../hooks/useExpiringAlert";
import { useLowStockAlert } from "../hooks/useLowStockAlert";
import { ExpiryBadge } from "./ExpiryBadge";

/**
 * The Inventory landing screen: what needs attention, and the way in to every
 * screen in the module.
 *
 * THE TWO ALERT LISTS ARE CHOSEN RATHER THAN EXHAUSTIVE. A shop owner opening
 * this page is asking one of exactly two questions — "what do I need to reorder"
 * and "what is about to go bad" — and both are answers you act on the same day.
 * Everything else (full stock value, movement history) is a click away on the
 * stock card and the batch report, where there is room to read it properly.
 *
 * BOTH LISTS ARE THE SERVER'S ANSWER, not a client-side scan. This screen used
 * to be a prototype over an in-memory store and computed both itself; each was
 * wrong in a way nobody would notice:
 *
 *   perlu restock — it compared ONE WAREHOUSE's shelf against `minStock`, which
 *                   is a per-PRODUCT threshold, and listed the same product once
 *                   per warehouse. `GET /products/low-stock` sums the product's
 *                   stock across warehouses, which is what the threshold means.
 *   kedaluwarsa   — it could only ever see the lots it happened to hold, so the
 *                   count was the count of the fixtures.
 *
 * Each list shows the most urgent FIVE and reports the true total beside it: a
 * landing page answers "is there anything to do", and a number that only counted
 * the rows on screen is worse than no number because it looks like a total.
 *
 * EACH SECTION IS GATED ON ITS OWN GRANT, and a section a user cannot read is
 * not requested at all. The seeded Staff role holds both, but a narrower custom
 * role need not — and firing the request anyway would paint a 403 across the
 * landing page instead of simply not offering the section.
 */
const ACTIONS: Array<{
  href: string;
  title: string;
  description: string;
  /** Mirrors the sidebar's gate for the same screen — see features/dashboard/nav.ts. */
  feature: Feature;
  action: Action;
}> = [
  {
    href: "/dashboard/inventory/products",
    title: "Produk & Varian",
    description:
      "Katalog: produk satuan, keluarga varian dua tingkat, dan bundle.",
    feature: "products",
    action: "read",
  },
  {
    href: "/dashboard/inventory/categories",
    title: "Kategori",
    description:
      "Rak arsip katalog. Setiap produk harus punya satu sebelum bisa dibuat.",
    feature: "categories",
    action: "read",
  },
  {
    href: "/dashboard/inventory/stock-card",
    title: "Kartu Stok",
    description:
      "Riwayat pergerakan satu produk di satu gudang, dengan saldo berjalan.",
    feature: "stockMovements",
    action: "read",
  },
  {
    href: "/dashboard/inventory/batches",
    title: "Batch & Expired",
    description:
      "Semua batch, diurutkan dari yang paling dekat kedaluwarsa. Urutan FEFO.",
    feature: "productBatches",
    action: "read",
  },
  {
    href: "/dashboard/inventory/opname",
    title: "Stok Opname",
    description:
      "Hitung fisik, cocokkan dengan sistem, selisihnya jadi penyesuaian dan jurnal.",
    feature: "stockOpnames",
    action: "read",
  },
  {
    href: "/dashboard/inventory/transfers",
    title: "Transfer Stok",
    description:
      "Pindahkan barang antar gudang. Batch beserta tanggal kedaluwarsanya ikut pindah.",
    feature: "stockMovements",
    action: "create",
  },
  {
    href: "/dashboard/inventory/adjustments",
    title: "Penyesuaian cepat",
    description:
      "Koreksi satu barang di luar opname — rusak, hilang, atau terpakai sendiri.",
    feature: "stockMovements",
    action: "create",
  },
];

export function InventoryHub() {
  const { can } = usePermissions();

  const mayReadProducts = can("products", "read");
  const mayReadBatches = can("productBatches", "read");

  const lowStock = useLowStockAlert(mayReadProducts);
  const expiring = useExpiringAlert(mayReadBatches);

  const actions = ACTIONS.filter((action) =>
    can(action.feature, action.action),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Inventory</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Stok dihitung dari buku besar pergerakan — bukan angka yang disimpan
          terpisah. Setiap saldo di layar ini bisa dihitung ulang dari nol.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((action) => (
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
        <AlertSection
          title="Perlu restock"
          total={lowStock.total}
          shown={lowStock.items.length}
          loading={lowStock.loading}
          error={lowStock.error}
          allowed={mayReadProducts}
          empty="Semua stok di atas batas minimum."
          moreLabel="produk lain juga di bawah batas minimum"
        >
          {lowStock.items.map((product) => (
            <li key={product._id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/dashboard/inventory/products/${product._id}`}
                  className="truncate text-sm font-medium hover:text-primary-hover"
                >
                  {product.name}
                </Link>
                <p className="truncate tabular-nums text-xs text-muted">
                  {product.sku ?? "—"}
                </p>
              </div>
              <span className="tabular-nums text-sm font-semibold text-danger">
                {formatQty(product.qtyOnHand)}
              </span>
              <span className="whitespace-nowrap text-xs text-muted">
                / {product.minStock} {product.unit}
              </span>
            </li>
          ))}
        </AlertSection>

        <AlertSection
          title="Mendekati kedaluwarsa"
          caption={`dalam ${expiring.withinDays} hari`}
          total={expiring.total}
          shown={expiring.items.length}
          loading={expiring.loading}
          error={expiring.error}
          allowed={mayReadBatches}
          empty={`Tidak ada lot yang kedaluwarsa dalam ${expiring.withinDays} hari.`}
          moreLabel="batch lain juga di dalam rentang ini"
          seeAll={{
            href: "/dashboard/inventory/batches",
            label: "Lihat semua batch",
          }}
        >
          {expiring.items.map((batch) => (
            <li key={batch._id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                {/* Resolved by the API — this screen never joins the catalogue
                    itself. Null only where the product row has since gone. */}
                <p className="truncate text-sm font-medium">
                  {batch.productName ?? "—"}
                </p>
                <p className="truncate tabular-nums text-xs text-muted">
                  {batch.batchCode}
                </p>
              </div>
              <div className="text-right">
                <p className="tabular-nums text-sm">
                  {formatQty(batch.qtyRemaining)}
                </p>
                <p className="tabular-nums text-[11px] text-muted">
                  {formatMoney(
                    multiplyDecimals(batch.qtyRemaining, batch.costPerUnit),
                  )}
                </p>
              </div>
              {/* A lot without a date cannot be in this list at all — the
                  endpoint only returns lots that expire. */}
              {batch.expiryDate && <ExpiryBadge date={batch.expiryDate} />}
            </li>
          ))}
        </AlertSection>
      </div>
    </div>
  );
}

/**
 * One alert list, and every state it can be in.
 *
 * THE COUNT IS THE SERVER'S TOTAL, not `children.length`. The list is the five
 * most urgent rows; the badge is how many there are. Showing "5" next to five
 * rows out of forty would tell somebody the job is nearly done.
 *
 * A ZERO IS NEVER SHOWN WHILE THE ANSWER IS IN FLIGHT, for the same reason the
 * batch tiles do not: "0 perlu restock" that changes its mind a second later has
 * already told somebody there was nothing to do.
 */
function AlertSection({
  title,
  caption,
  total,
  shown,
  loading,
  error,
  allowed,
  empty,
  moreLabel,
  seeAll,
  children,
}: {
  title: string;
  caption?: string;
  total: number;
  shown: number;
  loading: boolean;
  error: string | null;
  allowed: boolean;
  empty: string;
  /** Copy for the "…and N more" line under a truncated list. */
  moreLabel: string;
  seeAll?: { href: string; label: string };
  children: ReactNode;
}) {
  const remaining = total - shown;

  return (
    <section className="rounded-xl border border-border bg-surface">
      <header className="flex items-center gap-2 border-b border-border px-5 py-3">
        <h2 className="font-bold">{title}</h2>
        {caption && <span className="text-xs text-muted">{caption}</span>}
        <Badge variant="outline" className="ml-auto tabular-nums">
          {allowed ? (loading ? "…" : total) : "—"}
        </Badge>
      </header>

      {!allowed ? (
        <p className="px-5 py-10 text-center text-sm text-muted">
          Role Anda tidak punya akses ke data ini.
        </p>
      ) : error ? (
        <div className="px-5 py-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
          <Spinner /> Memuat…
        </div>
      ) : shown === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">{empty}</p>
      ) : (
        <>
          <ul className="divide-y divide-border/60">{children}</ul>
          {(remaining > 0 || seeAll) && (
            <div className="flex items-center gap-3 border-t border-border px-5 py-2.5 text-xs text-muted">
              {remaining > 0 && (
                <span>
                  +{remaining} {moreLabel}
                </span>
              )}
              {seeAll && (
                <Link
                  href={seeAll.href}
                  className="ml-auto font-medium text-primary hover:text-primary-hover"
                >
                  {seeAll.label} →
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
