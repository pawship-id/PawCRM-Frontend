import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { StockTransferDetail } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail transfer · Buloo" };

/**
 * The `id` here is the transfer DOCUMENT's id. A transfer is a numbered document
 * with a status now — filed, received later, corrected or cancelled in between —
 * and the detail is where each of those happens, so the page is gated on `read`
 * and the actions inside it on `create`.
 *
 * It also resolves a superseded posting id, so a stock-card row written by an
 * earlier revision of an edited transfer still lands on its document.
 */
export default async function StockTransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="stockTransfers">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventori", href: "/dashboard/inventory" },
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
            Barang yang dipindahkan, sudah diterima atau belum, dari batch
            mana, dan berapa nilainya.
          </p>
        </div>

        <StockTransferDetail transferId={id} />
      </div>
    </RequirePermission>
  );
}
