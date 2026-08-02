import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { StockCardScreen } from "@/features/inventory";

export const metadata: Metadata = { title: "Kartu stok · PawShip" };

export default function StockCardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Inventory", href: "/dashboard/inventory" },
            { label: "Kartu stok & batch" },
          ]}
        />
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Kartu stok &amp; batch
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Riwayat setiap pergerakan barang, dan urutan lot mana yang keluar
          duluan. Keduanya berasal dari catatan yang sama.
        </p>
      </div>

      <StockCardScreen />
    </div>
  );
}
