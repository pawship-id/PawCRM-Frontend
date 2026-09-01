import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { NegativeStockScreen } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Stok minus · Buloo" };

/**
 * Every shelf whose balance has gone below zero.
 *
 * REACHED FROM THE HUB'S CARD rather than from the sidebar, and that is the
 * placement rather than an oversight. A healthy shop has nothing here, and a
 * permanent nav row for a screen that is usually empty is a row people learn to
 * skip. The card on the Inventory hub appears exactly when there is something to
 * see — or when the shop allows overselling, so the place is discoverable before
 * the day it matters — and this is where "Lihat semua" goes.
 *
 * GATED ON `products:read`, the same grant the endpoint carries: this is a
 * catalogue question with a quantity in it, and the rows come back shaped like
 * products.
 */
export default function NegativeStockPage() {
  return (
    <RequirePermission feature="products" action="read">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventory", href: "/dashboard/inventory" },
              { label: "Stok minus" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Stok minus
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Barang yang terjual melebihi stok yang tercatat. Selama belum
            dibereskan, setiap angka yang dihitung dari saldo ini — termasuk
            nilai persediaan di laporan — ikut salah.
          </p>
        </div>

        <NegativeStockScreen />
      </div>
    </RequirePermission>
  );
}
