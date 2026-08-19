import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { OpeningStockForm } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Stok Awal · Buloo" };

export default function OpeningStockPage() {
  return (
    <RequirePermission feature="products" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventory", href: "/dashboard/inventory" },
              { label: "Stok Awal" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Stok Awal
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Untuk produk yang sudah terdaftar tapi belum pernah punya stok —
            barang yang sudah Anda miliki sebelum memakai Buloo. Tercatat
            sebagai modal pemilik, bukan sebagai kerugian, sehingga laporan laba
            rugi tidak ikut terpengaruh.
          </p>
        </div>

        <OpeningStockForm />
      </div>
    </RequirePermission>
  );
}
