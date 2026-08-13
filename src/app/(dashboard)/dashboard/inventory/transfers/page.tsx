import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { StockTransferForm } from "@/features/inventory";

export const metadata: Metadata = { title: "Transfer stok · PawShip" };

export default function StockTransfersPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Inventory", href: "/dashboard/inventory" },
            { label: "Transfer stok" },
          ]}
        />
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Transfer stok antar gudang
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Pindahkan barang antar gudang — misalnya menyiapkan stok untuk bazar.
          Satu transfer boleh membawa beberapa produk sekaligus, dan lot beserta
          tanggal kedaluwarsanya ikut berpindah.
        </p>
      </div>

      <StockTransferForm />
    </div>
  );
}
