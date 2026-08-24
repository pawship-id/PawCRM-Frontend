import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { StockTransferForm } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Transfer baru · Buloo" };

export default function NewStockTransferPage() {
  return (
    <RequirePermission feature="stockMovements" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventory", href: "/dashboard/inventory" },
              {
                label: "Transfer stok",
                href: "/dashboard/inventory/transfers",
              },
              { label: "Transfer baru" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Transfer baru
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Pindahkan barang antar gudang — misalnya menyiapkan stok untuk
            bazar. Satu transfer boleh membawa beberapa produk sekaligus, dan lot
            beserta tanggal kedaluwarsanya ikut berpindah.
          </p>
        </div>

        <StockTransferForm />
      </div>
    </RequirePermission>
  );
}
