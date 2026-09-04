import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { StockEntryDetail } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Dokumen stok awal · Buloo" };

export default async function OpeningStockDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="products" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventory", href: "/dashboard/inventory" },
              {
                label: "Stok Awal",
                href: "/dashboard/inventory/opening-stock",
              },
              { label: "Dokumen" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Dokumen stok awal
          </h1>
        </div>

        <StockEntryDetail id={id} kind="opening_balance" />
      </div>
    </RequirePermission>
  );
}
