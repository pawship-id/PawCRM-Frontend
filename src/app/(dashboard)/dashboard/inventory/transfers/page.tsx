import type { Metadata } from "next";
import Link from "next/link";

import { StockTransferForm } from "@/features/inventory";

export const metadata: Metadata = { title: "Transfer stok · PawShip" };

export default function StockTransfersPage() {
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
          Transfer stok antar gudang
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Pindahkan barang antar gudang — misalnya menyiapkan stok untuk bazar.
          Lot beserta tanggal kedaluwarsanya ikut berpindah.
        </p>
      </div>

      <StockTransferForm />
    </div>
  );
}
