import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { StockTransfersScreen } from "@/features/inventory";
import { TRANSFER_MAX_ITEMS } from "@/features/inventory/utils/transferErrors";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Transfer Stok · Buloo" };

/**
 * THE LIST COMES FIRST, and the form is behind a button — the same move the
 * adjustment route made, for a sharper version of the same reason.
 *
 * This route used to open straight onto the form. A transfer writes no journal
 * and mints no document number, so once the form cleared itself the only trace
 * left was a pair of rows on two different stock cards — and "apa saja yang
 * dibawa ke bazar Sabtu lalu" became unanswerable, even though the module had
 * deliberately written the whole thing as ONE posting under one correlation id
 * precisely so that it could be answered.
 *
 * GATED ON `read`, not on `create`. The list is a record of what moved, and
 * somebody who may page the stock card may read what explains its rows. The
 * write is gated separately, on the button here and on the /new route.
 */
export default function StockTransfersPage() {
  return (
    <RequirePermission feature="stockTransfers">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventori", href: "/dashboard/inventory" },
              { label: "Transfer Stok" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Transfer stok antar gudang
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Pindahkan barang antar gudang, misalnya untuk stok bazar. Satu
            transfer bisa berisi hingga {TRANSFER_MAX_ITEMS} produk, dan batch-nya
            ikut pindah.
          </p>
        </div>

        <StockTransfersScreen />
      </div>
    </RequirePermission>
  );
}
