import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { StockEntriesScreen } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Penyesuaian Stok · Buloo" };

/**
 * THE LIST COMES FIRST, and the form is behind a button.
 *
 * This route used to open straight onto the form, which meant a correction could
 * be made and then never found again — the movements landed in the stock card
 * one product at a time, with nothing saying how many corrections a shop had
 * made or why. Every other document in this system opens on its list.
 *
 * GATED ON `read`, not on `create`: the list is paperwork over the ledger, and
 * somebody who may page the stock card may read what explains its rows. The
 * write is gated separately, on the button and on the /new route.
 */
export default function StockAdjustmentsPage() {
  return (
    <RequirePermission feature="stockMovements" action="read">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventory", href: "/dashboard/inventory" },
              { label: "Penyesuaian Stok" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Penyesuaian Stok
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Koreksi stok di luar opname — rusak, hilang, atau terpakai sendiri.
            Nilainya masuk sebagai <b>kerugian persediaan</b>, dan tiap koreksi
            punya nomor dokumennya sendiri.
          </p>
        </div>

        <StockEntriesScreen kind="adjustment" />
      </div>
    </RequirePermission>
  );
}
