import type { Metadata } from "next";
import Link from "next/link";

import { StockAdjustmentForm } from "@/features/inventory";

export const metadata: Metadata = {
  title: "Stok awal & penyesuaian · PawShip",
};

export default function StockAdjustmentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/inventory"
          className="text-xs text-muted hover:text-foreground"
        >
          ← Inventory
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
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
