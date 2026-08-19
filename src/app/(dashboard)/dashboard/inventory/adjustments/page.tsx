import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { StockAdjustmentForm } from "@/features/inventory";

export const metadata: Metadata = {
  title: "Penyesuaian Stok · Buloo",
};

export default function StockAdjustmentsPage() {
  return (
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
          Koreksi satu barang di luar opname — rusak, hilang, atau terpakai
          sendiri. Barang yang sudah ada sebelum pakai Buloo sebaiknya diisi
          lewat <b>Stok awal</b> saat membuat produknya; kalau produknya
          terlanjur dibuat tanpa stok, isi di sini.
        </p>
      </div>

      <StockAdjustmentForm />
    </div>
  );
}
