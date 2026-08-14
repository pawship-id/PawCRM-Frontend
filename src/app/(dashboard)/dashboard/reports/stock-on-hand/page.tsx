import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { StockOnHandScreen } from "@/features/reports";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Stok per Cabang · PawShip" };

/**
 * Gated on `products:read`, matching `GET /api/reports/stock-on-hand`. The hub
 * already hides the card for a role without it; this covers direct URL entry.
 */
export default function StockOnHandPage() {
  return (
    <RequirePermission feature="products" action="read">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Reports", href: "/dashboard/reports" },
              // No href: this is the page. See Breadcrumb for why the last crumb
              // must not link to itself.
              { label: "Stok per Cabang" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Stok per Cabang
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Qty, HPP rata-rata dan nilai persediaan per produk per gudang.
            Gudang dikelompokkan menurut cabangnya — yang belum punya cabang
            muncul di bawah &quot;Tanpa cabang&quot;.
          </p>
        </div>

        <StockOnHandScreen />
      </div>
    </RequirePermission>
  );
}
