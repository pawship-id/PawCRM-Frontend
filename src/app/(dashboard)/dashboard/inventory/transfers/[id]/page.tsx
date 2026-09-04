import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { StockTransferDetail } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail transfer · Buloo" };

/**
 * The `id` here is a CORRELATION ID, not a document's primary key: a transfer
 * has no collection of its own, and what ties its rows together is the id the
 * ledger stamps on every row of one posting. See StockMovementService.
 *
 * Gated on `read`, like the list: this is a record of what moved, and somebody
 * who may page the stock card may read what explains its rows.
 */
export default async function StockTransferDetailPage({
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
              {
                label: "Transfer Stok",
                href: "/dashboard/inventory/transfers",
              },
              { label: "Detail" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Detail transfer
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Barang yang dipindahkan, dari batch mana, dan berapa nilainya.
          </p>
        </div>

        <StockTransferDetail transferId={id} />
      </div>
    </RequirePermission>
  );
}
