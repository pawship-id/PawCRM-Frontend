import type { Metadata } from "next";

import {
  PageHeading,
  PURCHASING_CRUMBS,
  PurchaseReturnDetail,
} from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail retur · PawShip" };

/**
 * Gated on `read`, not on `update` or `submit` — the screen itself hides the
 * controls a role does not hold. Gating the whole page on the stronger
 * permission would hide a submitted return from everybody who may only read one,
 * which is most of the people who ever need to look at it.
 */
export default async function PurchaseReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="purchaseReturns" action="read">
      <div className="flex flex-col gap-6">
        <PageHeading
          crumbs={[
            PURCHASING_CRUMBS.hub,
            PURCHASING_CRUMBS.returns,
            { label: "Detail retur" },
          ]}
          title="Detail retur"
        >
          Selama masih draft, retur bisa diubah, dihitung dampaknya, lalu
          disubmit. Setelah final, stok dan pembukuannya tidak bisa ditarik
          kembali.
        </PageHeading>

        <PurchaseReturnDetail returnId={id} />
      </div>
    </RequirePermission>
  );
}
