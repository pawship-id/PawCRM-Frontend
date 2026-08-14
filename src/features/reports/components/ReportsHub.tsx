"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/features/permissions";
import type { Action, Feature } from "@/features/permissions/types";

/**
 * The reports landing page — seven cards, and one of them is deliberately dead.
 *
 * MOST OF THESE LINK SOMEWHERE THAT ALREADY EXISTS, and that is the design
 * rather than a shortcut. The stock card, the expiry list and the opname history
 * are full screens with their own filters and exports; building "report"
 * versions of them here would be the fastest possible way to end up with two
 * screens that answer the same question and slowly stop agreeing. Reports is a
 * table of contents for them plus the three that had no home.
 *
 * PERMISSIONS ARE PER CARD, not on the page. A groomer with `products:read` and
 * nothing else should see the stock reports and not the consignment one, so each
 * card names the grant its destination actually enforces — the same grant, not a
 * looser one, because a card that leads to a 403 is worse than no card.
 */

interface ReportCard {
  title: string;
  description: string;
  href: string;
  feature: Feature;
  action: Action;
  /**
   * Set when a report cannot work yet, with the reason. Renders disabled rather
   * than hidden — see the note on the sales report below.
   */
  blockedBy?: string;
}

const CARDS: ReportCard[] = [
  {
    title: "Stok per Cabang",
    description:
      "Qty, HPP rata-rata dan nilai persediaan per produk per gudang, dikelompokkan per cabang.",
    href: "/dashboard/reports/stock-on-hand",
    feature: "products",
    action: "read",
  },
  {
    title: "Kartu Stok",
    description:
      "Riwayat pergerakan satu produk di satu gudang, lengkap dengan saldo dan lot yang terpakai.",
    href: "/dashboard/inventory/stock-card",
    feature: "stockMovements",
    action: "read",
  },
  {
    title: "Stok Minim",
    description:
      "Produk yang sudah di bawah batas restock, paling mendesak di atas.",
    href: "/dashboard/reports/low-stock",
    feature: "products",
    action: "read",
  },
  {
    title: "Produk Mendekati Expired",
    description:
      "Lot yang masih ada isinya dan kedaluwarsa dalam waktu dekat, beserta nilainya.",
    href: "/dashboard/inventory/batches",
    feature: "productBatches",
    action: "read",
  },
  {
    title: "Konsinyasi Outstanding",
    description:
      "Barang titipan yang masih di gudang, per supplier. Belum jadi utang — utang muncul saat barangnya laku.",
    href: "/dashboard/reports/consignment",
    feature: "productBatches",
    action: "read",
  },
  {
    title: "Riwayat Opname",
    description:
      "Stok opname yang sudah disubmit, selisihnya, dan jurnal yang terbentuk.",
    href: "/dashboard/inventory/opname",
    feature: "stockOpnames",
    action: "read",
  },
  {
    /**
     * SHOWN AND DISABLED, not hidden — a deliberate choice, and the trade is
     * worth naming. A hidden card leaves an owner wondering whether the feature
     * exists; a dead one says "this is coming and here is what blocks it". The
     * cost is one inert tile on a page people visit often, which is why it sorts
     * last and says why rather than merely greying out.
     */
    title: "Sales per Produk",
    description:
      "Produk terlaris, per kategori dan per periode, dari transaksi penjualan.",
    href: "/dashboard/sales",
    feature: "products",
    action: "read",
    blockedBy: "Menunggu modul POS — belum ada transaksi penjualan untuk dilaporkan.",
  },
];

export function ReportsHub() {
  const { can } = usePermissions();

  const visible = CARDS.filter((card) => can(card.feature, card.action));

  if (visible.length === 0) {
    return (
      <p className="text-sm text-muted">
        Role Anda belum punya akses ke satu pun laporan. Hubungi owner atau admin
        untuk membuka aksesnya.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((card) =>
        card.blockedBy ? (
          <div
            key={card.title}
            aria-disabled="true"
            className="rounded-2xl border border-border bg-surface p-5 opacity-60"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-medium text-foreground">{card.title}</h2>
              <Badge variant="outline">Segera</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">{card.description}</p>
            <p className="mt-2 text-xs text-muted">{card.blockedBy}</p>
          </div>
        ) : (
          <Link
            key={card.title}
            href={card.href}
            className={cn(
              "rounded-2xl border border-border bg-surface p-5 transition-colors",
              "hover:border-primary/40",
            )}
          >
            <h2 className="font-medium text-foreground">{card.title}</h2>
            <p className="mt-1 text-sm text-muted">{card.description}</p>
          </Link>
        ),
      )}
    </div>
  );
}
