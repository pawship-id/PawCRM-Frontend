import type { Metadata } from "next";

import { BatchesScreen } from "@/features/inventory";

export const metadata: Metadata = { title: "Batch & Expired · PawShip" };

export default function BatchesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Batch &amp; Expired
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Semua lot di seluruh gudang, diurutkan dari yang paling dekat
          kedaluwarsa. Yang sudah lewat tanggal muncul paling atas.
        </p>
      </div>

      <BatchesScreen />
    </div>
  );
}
