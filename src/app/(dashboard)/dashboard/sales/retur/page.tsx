import type { Metadata } from "next";
import { Undo2 } from "lucide-react";

import { ModuleTabPlaceholder } from "@/features/dashboard";
import { SalesModuleHeader } from "@/features/sales";

export const metadata: Metadata = {
  title: "Retur · Penjualan · Buloo",
};

/**
 * The Retur tab. UNGATED, because there is nothing yet to gate: unlike returns
 * to a supplier, a sales return has no feature in the RBAC catalogue at all, so
 * naming one here would be inventing a permission the server has never heard of.
 * It gains a `RequirePermission` the day the feature exists.
 */
export default function SalesReturnsTabPage() {
  return (
    <ModuleTabPlaceholder
      header={<SalesModuleHeader />}
      title="Retur"
      note="Barang yang dikembalikan pelanggan — stok masuk lagi dan tagihannya ikut berkurang. Untuk sekarang, penjualan yang salah dibatalkan lewat Void di detail fakturnya."
      icon={Undo2}
    />
  );
}
