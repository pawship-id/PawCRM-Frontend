import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { StockAdjustmentForm } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Penyesuaian baru · Buloo" };

export default function NewStockAdjustmentPage() {
  return (
    <RequirePermission feature="stockMovements" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventory", href: "/dashboard/inventory" },
              { label: "Penyesuaian Stok", href: "/dashboard/inventory/adjustments" },
              { label: "Penyesuaian baru" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Penyesuaian baru
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Koreksi stok di luar opname — rusak, hilang, atau terpakai sendiri.
            Nilainya masuk sebagai <b>kerugian persediaan</b>.
          </p>
        </div>

        <StockAdjustmentForm />
      </div>
    </RequirePermission>
  );
}
