import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { StockEntryDetail } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Dokumen penyesuaian · Buloo" };

export default async function StockAdjustmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="stockMovements" action="read">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventory", href: "/dashboard/inventory" },
              { label: "Penyesuaian Stok", href: "/dashboard/inventory/adjustments" },
              { label: "Dokumen" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Dokumen penyesuaian
          </h1>
        </div>

        <StockEntryDetail id={id} kind="adjustment" />
      </div>
    </RequirePermission>
  );
}
