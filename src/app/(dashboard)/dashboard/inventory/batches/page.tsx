import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { BatchesScreen } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Batch & Expired · PawShip" };

export default function BatchesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Inventory", href: "/dashboard/inventory" },
            { label: "Batch & Expired" },
          ]}
        />
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Batch &amp; Expired
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Semua lot di seluruh gudang, diurutkan dari yang paling dekat
          kedaluwarsa. Yang sudah lewat tanggal muncul paling atas.
        </p>
      </div>

      {/* The nav already hides this link from a role without the grant; this
          covers direct URL entry. */}
      <RequirePermission feature="productBatches">
        <BatchesScreen />
      </RequirePermission>
    </div>
  );
}
