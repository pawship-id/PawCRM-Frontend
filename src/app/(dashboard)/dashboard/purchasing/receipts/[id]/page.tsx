import type { Metadata } from "next";

import {
  PageHeading,
  PURCHASING_CRUMBS,
  ReceiptDetail,
} from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail penerimaan · PawShip" };

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="goodsReceipts" action="read">
      <div className="flex flex-col gap-6">
        <PageHeading
          crumbs={[
            PURCHASING_CRUMBS.hub,
            PURCHASING_CRUMBS.receipts,
            { label: "Detail penerimaan" },
          ]}
          title="Detail penerimaan"
        />
        <ReceiptDetail receiptId={id} />
      </div>
    </RequirePermission>
  );
}
