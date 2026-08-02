import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { OpnameScreen } from "@/features/inventory";

export const metadata: Metadata = { title: "Stok Opname · PawShip" };

export default function OpnamePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Inventory", href: "/dashboard/inventory" },
            { label: "Stok Opname" },
          ]}
        />
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Stok Opname</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Hitung fisik lalu cocokkan dengan catatan sistem. Selisihnya langsung
          jadi penyesuaian stok dan jurnal — kelebihan masuk pendapatan
          lain-lain, kekurangan jadi kerugian persediaan.
        </p>
      </div>

      <OpnameScreen />
    </div>
  );
}
