import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { LowStockScreen } from "@/features/reports";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Stok Minim · Buloo" };

/** Gated on `products:read`, matching `GET /api/products/low-stock`. */
export default function LowStockPage() {
  return (
    <RequirePermission feature="products" action="read">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Reports", href: "/dashboard/reports" },
              { label: "Stok Minim" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Stok Minim
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Produk yang stoknya sudah di bawah batas restock. Batas dihitung per
            produk across semua gudang, bukan per gudang.
          </p>
        </div>

        <LowStockScreen />
      </div>
    </RequirePermission>
  );
}
