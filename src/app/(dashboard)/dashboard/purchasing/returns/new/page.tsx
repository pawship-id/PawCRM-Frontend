import type { Metadata } from "next";

import {
  PageHeading,
  PURCHASING_CRUMBS,
  PurchaseReturnForm,
} from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Buat retur · PawShip" };

/**
 * `?receipt=` preselects the delivery, which is how the goods-receipt detail
 * screen hands over: somebody looking at a delivery decides to send part of it
 * back, and re-finding it in a picker is a step that only exists to be got wrong.
 */
export default async function NewPurchaseReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ receipt?: string }>;
}) {
  const { receipt } = await searchParams;

  return (
    <RequirePermission feature="purchaseReturns" action="create">
      <div className="flex flex-col gap-6">
        <PageHeading
          crumbs={[
            PURCHASING_CRUMBS.hub,
            PURCHASING_CRUMBS.returns,
            { label: "Buat retur" },
          ]}
          title="Buat retur"
        >
          Menyimpan di sini membuat <b>draft</b> — belum ada stok yang keluar dan
          belum ada utang yang berkurang. HPP dibalik memakai harga beli asli
          dari penerimaannya, dan itu terjadi saat retur disubmit dari halaman
          detail.
        </PageHeading>

        <PurchaseReturnForm receiptId={receipt} />
      </div>
    </RequirePermission>
  );
}
