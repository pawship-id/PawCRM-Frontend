import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { StockAdjustmentForm } from "@/features/inventory";

export const metadata: Metadata = {
  title: "Stok awal & penyesuaian · Buloo",
};

export default function StockAdjustmentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Inventory", href: "/dashboard/inventory" },
            { label: "Stok awal & penyesuaian" },
          ]}
        />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">
          Stok awal &amp; penyesuaian
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Masukkan stok pertama kali saat mulai memakai PawCRM, atau perbaiki
          selisih karena barang rusak, hilang, dan terpakai sendiri.
        </p>
      </div>

      <StockAdjustmentForm />
    </div>
  );
}
