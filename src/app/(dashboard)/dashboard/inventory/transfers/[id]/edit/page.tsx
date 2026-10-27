import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { StockTransferEditScreen } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Ubah transfer · Buloo" };

/**
 * Correcting a transfer that has not been received.
 *
 * Gated on `create`, not on a permission of its own: the catalog gives
 * `stockMovements` only `create` and `read`, and an edit here is a reversal and
 * a re-post — the same act of moving stock a new transfer is. Whether the
 * transfer is STILL correctable is the screen's question, not the route's.
 */
export default async function EditStockTransferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="stockTransfers" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventori", href: "/dashboard/inventory" },
              {
                label: "Transfer Stok",
                href: "/dashboard/inventory/transfers",
              },
              { label: "Detail", href: `/dashboard/inventory/transfers/${id}` },
              { label: "Ubah" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Ubah transfer
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Barang, jumlah, batch, gudang, dan catatan masih bisa diubah selama
            transfer belum diterima.
          </p>
        </div>

        <StockTransferEditScreen transferId={id} />
      </div>
    </RequirePermission>
  );
}
